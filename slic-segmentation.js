/**
 * Javascript implementation of an image segmentation algorithm of
 *
 *    SLIC Superpixels
 *    Radhakrishna Achanta, Appu Shaji, Kevin Smith, Aurelien Lucchi, Pascal
 *    Fua, and Sabine Süsstrunk
 *    IEEE Transactions on Pattern Analysis and Machine Intelligence, vol. 34,
 *    num. 11, p. 2274 - 2282, May 2012.
 *
 * and based on the VLFeat implementation.
 *
 * API
 * ---
 *
 *    SLICSegmentation(imageURL, options)
 *
 * The function takes the following options.
 * * `regionSize` - Parameter of superpixel size
 * * `regularization` - Regularization parameter. See paper.
 * * `minRegionSize` - Minimum segment size in pixels.
 * * `toDataURL` - Callback function to receive the result as a data URL.
 * * `callback` - Function to be called on finish. The function takes a single
 *                argument of result object that contains following fields.
 *    * `width` - Width of the image in pixels.
 *    * `height` - Height of the image in pixels.
 *    * `size` - Number of segments.
 *    * `indexMap` - Int32Array of `width * height` elements containing
 *                   segment index for each pixel location. The segment index
 *                   at pixel `(i, j)` is `indexMap(i * width + j)`, where
 *                   `i` is the y coordinate of the pixel and `j` is the x
 *                   coordinate.
 *
 * LongLong Yu 2014.
 */
(function() {
  // Convert RGBA into XYZ color space. rgba: Red Green Blue Alpha.
  function rgb2xyz(rgba, w, h) {
    var xyz = new Float32Array(3*w*h);
    for (var i = 0; i<w*h; ++i) {
      var r = parseFloat(rgba[4*i+0]),
          g = parseFloat(rgba[4*i+1]),
          b = parseFloat(rgba[4*i+2]);
      xyz[i] = (r * 0.4887180 + g * 0.310680 + b * 0.2006020) * 0.00392156862;
      xyz[i + w*h] = (r * 0.1762040 + g * 0.812985 + b * 0.0108109) *
                     0.00392156862;
      xyz[i + 2*w*h] = (g * 0.0102048 + b * 0.989795) * 0.00392156862;
    }
    return xyz;
  }

  // Convert XYZ to Lab.
  function xyz2lab(xyz, w, h) {
    function f(x) {
      if (x > 0.00856)
        return Math.pow(x, 0.33333333);
      else
        return 7.78706891568 * x + 0.1379310336;
    }
    var xw = 1.0/3.0,
        yw = 1.0/3.0,
        Yw = 1.0,
        Xw = xw / yw,
        Zw = (1-xw-yw) / yw * Yw,
        ix = 1.0 / Xw,
        iy = 1.0 / Yw,
        iz = 1.0 / Zw,
        lab = new Float32Array(3*w*h);
    for (var i = 0; i<w*h; ++i) {
      var fx = f(xyz[i] * ix),
          fy = f(xyz[w*h + i] * iy),
          fz = f(xyz[2*w*h + i] * iz);
      lab[i] = 116.0 * fy - 16.0;
      lab[i + w*h] = 500.0 * (fx - fy);
      lab[i + 2*w*h] = 200.0 * (fy - fz);
    }
    return lab;
  }

  // Compute gradient of 3 channel color space image.
  function computeEdge(image, edgeMap, w, h) {
    for (var k = 0; k<3; ++k)
      for (var y = 1; y<h-1; ++y)
        for (var x = 1; x<w-1; ++x) {
          var a = image[k*w*h + y*w + x-1],
          b = image[k*w*h + y*w + x+1],
          c = image[k*w*h + (y+1)*w + x],
          d = image[k*w*h + (y-1)*w + x];
          edgeMap[y*w +x] = edgeMap[y*w +x] + (a-b) * (a-b) + (c-d) * (c-d);
        }
  }

  // Initialize superpixel clusters.
  function initializeKMeansCenters(image,
                                   edgeMap,
                                   centers,
                                   numRegionsX,
                                   numRegionsY,
                                   regionSize,
                                   imW,
                                   imH) {
    var x,
        y,
        i = 0;
    for (var v = 0; v < numRegionsY; ++v)
      for (var u = 0; u < numRegionsX; ++u) {
        var xp,
            yp,
            centerx = 0,
            centery = 0;
            minEdgeValue = Infinity;
        x = parseInt(Math.round(regionSize * (u + 0.5)), 10);
        y = parseInt(Math.round(regionSize * (v + 0.5)), 10);
        x = Math.max(Math.min(x, imW-1),0);
        y = Math.max(Math.min(y, imH-1),0);
        // Search in a 3x3 neighbourhood the smallest edge response.
        for (yp = Math.max(0, y-1); yp <= Math.min(imH-1, y+1); ++yp)
          for (xp = Math.max(0, x-1); xp <= Math.min(imW-1, x+1); ++xp) {
            var thisEdgeValue = edgeMap[yp * imW + xp];
            if (thisEdgeValue < minEdgeValue) {
              minEdgeValue = thisEdgeValue;
              centerx = xp;
              centery = yp;
            }
          }

        // Initialize the new center at this location.
        centers[i++] = parseFloat(centerx);
        centers[i++] = parseFloat(centery);
        // 3 channels.
        centers[i++] = image[centery * imW + centerx];
        centers[i++] = image[imW * imH + centery * imW + centerx];
        centers[i++] = image[2 * imW * imH + centery * imW + centerx];
      }
  }

  // Compute energy of clustering assignment.
  function computeSLICEnergy(image,
                             segmentation,
                             centers,
                             factor,
                             numRegionsX,
                             numRegionsY,
                             regionSize,
                             imW,
                             imH) {
    var energy = 0;
    // Assign pixels to centers.
    for (var y = 0; y < imH; ++y)
      for (var x = 0; x < imW; ++x) {
        var u = Math.floor(parseFloat(x) / regionSize - 0.5),
            v = Math.floor(parseFloat(y) / regionSize - 0.5),
            up,
            vp,
            minDistance = Infinity;
        for (vp = Math.max(0, v); vp <= Math.min(numRegionsY-1, v+1); ++vp)
          for (up = Math.max(0, u); up <= Math.min(numRegionsX-1, u+1); ++up) {
            var region = up  + vp * numRegionsX,
                centerx = centers[5 * region + 0],
                centery = centers[5 * region + 1],
                spatial = (x - centerx) * (x - centerx) +
                          (y - centery) * (y - centery),
                dR = image[y*imW + x] - centers[5*region + 2],
                dG = image[imW * imH + y*imW + x] - centers[5*region + 3],
                dB = image[2 * imW * imH + y*imW + x] - centers[5*region + 4],
                appearance = dR * dR + dG * dG + dB * dB,
                distance = appearance + factor * spatial;
            if (minDistance > distance) {
              minDistance = distance;
              segmentation[y*imW + x] = region;
            }
          }
        energy += minDistance;
      }
    return energy / (numRegionsX * numRegionsY);
  }

  // Re-compute clusters.
  function computeCenters(image,
                          segmentation,
                          masses,
                          centers,
                          numRegions,
                          imW,
                          imH) {
    for (var y = 0; y < imH; ++y)
      for (var x = 0; x < imW; ++x) {
        var region = segmentation[x + y * imW];
        masses[region] ++;
        centers[region * 5 + 0] += x;
        centers[region * 5 + 1] += y;
        centers[region * 5 + 2] += image[y*imW + x];
        centers[region * 5 + 3] += image[imW*imH + y*imW + x];
        centers[region * 5 + 4] += image[2*imW*imH + y*imW + x];
      }
    for (var i = 0; i < numRegions; ++i) {
      var iMass = 1.0 / Math.max(masses[i], 1e-8);
      centers[i*5] = centers[i*5] * iMass;
      centers[i*5+1] = centers[i*5+1] * iMass;
      centers[i*5+2] = centers[i*5+2] * iMass;
      centers[i*5+3] = centers[i*5+3] * iMass;
      centers[i*5+4] = centers[i*5+4] * iMass;
    }
  }

  // Remove small superpixels and assign them the nearest superpixel label.
  function eliminateSmallRegions(segmentation,
                                 minRegionSize,
                                 numPixels,
                                 imW,
                                 imH) {
    var cleaned = new Int32Array(numPixels),
        segment = new Int32Array(numPixels),
        segmentSize,
        label,
        cleanedLabel,
        numExpanded,
        dx = new Array(1, -1, 0, 0),
        dy = new Array(0, 0, 1, -1),
        pixel,
        x,
        y,
        direction,
        xp,
        yp,
        neighbor;
    for (pixel = 0; pixel < numPixels; ++pixel) {
      if (cleaned[pixel]) continue;
      label = segmentation[pixel];
      numExpanded = 0;
      segmentSize = 0;
      segment[segmentSize++] = pixel;
      // Find cleanedLabel as the label of an already cleaned region
      // neighbour of this pixel.
      cleanedLabel = label + 1;
      cleaned[pixel] = label + 1;
      x = (pixel % imW);
      y = Math.floor(pixel / imW);
      for (direction = 0; direction < 4; direction++) {
        xp = x + dx[direction];
        yp = y + dy[direction];
        neighbor = xp + yp * imW;
        if (0 <= xp && xp < imW && 0 <= yp && yp < imH && cleaned[neighbor])
          cleanedLabel = cleaned[neighbor];
      }
      // Expand the segment.
      while (numExpanded < segmentSize) {
        var open = segment[numExpanded++];
        x = open % imW;
        y = Math.floor(open / imW );
        for (direction = 0; direction < 4; ++direction) {
          xp = x + dx[direction];
          yp = y + dy[direction];
          neighbor = xp + yp * imW;
          if (0 <= xp &&
              xp < imW &&
              0 <= yp &&
              yp < imH &&
              cleaned[neighbor] === 0 &&
              segmentation[neighbor] === label) {
            cleaned[neighbor] = label + 1;
            segment[segmentSize++] = neighbor;
          }
        }
      }
      // Change label to cleanedLabel if the semgent is too small.
      if (segmentSize < minRegionSize)
        while (segmentSize > 0)
          cleaned[segment[--segmentSize]] = cleanedLabel;
    }
    // Restore base 0 indexing of the regions.
    for (pixel = 0; pixel < numPixels; ++pixel)
      --cleaned[pixel];
    for (var i =0; i < numPixels; ++i)
      segmentation[i] = cleaned[i];
  }

  // Compute SLIC Segmentation.
  function computeSLICSegmentation(imageData, options) {
    var imWidth = imageData.width,
        imHeight = imageData.height,
        numRegionsX = parseInt(imWidth / options.regionSize, 10),
        numRegionsY = parseInt(imHeight / options.regionSize, 10),
        numRegions = parseInt(numRegionsX * numRegionsY, 10),
        numPixels = parseInt(imWidth * imHeight, 10),
        regionSize = options.regionSize,
        edgeMap = new Float32Array(numPixels),
        masses = new Array(numPixels),
        centers = new Float32Array((2+3)*numRegions);
        // 2 (geometric: x & y) and 3 (RGB or Lab).
    // First, convert RGB 2 Lab space.
    var lab = xyz2lab(rgb2xyz(imageData.data, imageData.width, imageData.height),
                      imageData.width,
                      imageData.height);
    computeEdge(lab, edgeMap, imageData.width, imageData.height);
    // Initialize K-Means Centers.
    initializeKMeansCenters(lab,
                            edgeMap,
                            centers,
                            numRegionsX,
                            numRegionsY,
                            regionSize,
                            imageData.width,
                            imageData.height);
    var previousEnergy = Infinity,
        startingEnergy = 0,
        maxNumIterations = 10.0,
        factor = options.regularization * options.regularization /
                 (regionSize * regionSize),
        segmentation = new Int32Array(numPixels),
        iter;
    for (iter = 0; iter < maxNumIterations; ++iter) {
      // Do superpixel assignment and energy computation.
      var energy = computeSLICEnergy(lab,
                                     segmentation,
                                     centers,
                                     factor,
                                     numRegionsX,
                                     numRegionsY,
                                     regionSize,
                                     imageData.width,
                                     imageData.height);
      if (iter === 0)
        startingEnergy = energy;
      else
        if (Math.abs(previousEnergy - energy) < 1e-5)
          break;
      previousEnergy = energy;
      // Recompute centers.
      var i;
      for (i = 0; i < masses.length; ++i)
        masses[i] = 0;
      for (i = 0; i < centers.length; ++i)
        centers[i] = 0;
      // Compute centers.
      computeCenters(lab,
                     segmentation,
                     masses,
                     centers,
                     numRegions,
                     imageData.width,
                     imageData.height);
    }
    eliminateSmallRegions(segmentation,
                          options.minRegionSize,
                          numPixels,
                          imageData.width,
                          imageData.height);
    return segmentation;
  }

  // Remap label indices.
  function remapLabels(segmentation) {
    var map = {},
        index = 0;
    for (var i = 0; i < segmentation.length; ++i) {
      var label = segmentation[i];
      if (map[label] === undefined)
        map[label] = index++;
      segmentation[i] = map[label];
    }
    return index;
  }

  // Compute segmentation.
  function computeSegmentation(imageData, options) {
    var segmentation = computeSLICSegmentation(imageData, options),
        numSegments = remapLabels(segmentation);
    if (options.callback) {
      var rgbData = new Uint8Array(imageData.data);
      options.callback({
        width: imageData.width,
        height: imageData.height,
        size: numSegments,
        indexMap: segmentation,
        rgbData: rgbData
      });
    }
    if (options.toDataURL)
      getDataURL(imageData.width, imageData.height, indexMap, options);
  }

  // Convert to Data URL.
  function getDataURL(width, height, indexMap, options) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d'),
        imageData = context.createImageData(width, height),
        data = imageData.data;
    for (var i = 0; i < indexMap.length; ++i) {
      var value = indexMap[i];
      data[4 * i + 0] = value & 255;
      data[4 * i + 1] = (value >>> 8) & 255;
      data[4 * i + 2] = (value >>> 16) & 255;
    }
    context.putImageData(imageData, 0, 0);
    options.toDataURL(canvas.toDataURL());
  }

  // When image is loaded.
  function onSuccessImageLoad(image, options) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    var imageData = context.getImageData(0, 0, image.width, image.height),
        segmentation = computeSegmentation(imageData, options);
  }

  // When image is invalid.
  function onErrorImageLoad() {
    alert('Failed to load an image: ' + image.src);
  }

  // Public API.
  window.SLICSegmentation = function(imageURL, options) {
    if (typeof options === 'undefined') options = {};
    // the lateral side of a rectangle superpixel in pixels.
    if (options.regionSize === undefined) options.regionSize = 40;
    if (options.regularization === undefined) options.regularization = 1;
    // width or high should be larger than 20 pixels
    if (options.minRegionSize === undefined)
      options.minRegionSize = options.regionSize * options.regionSize / 2;
    var image = new Image();
    image.src = imageURL;
    image.crossOrigin = null;
    image.onerror = function() { onErrorImageLoad(image); };
    image.onload = function() { onSuccessImageLoad(image, options); };
  };
}).call(this);
