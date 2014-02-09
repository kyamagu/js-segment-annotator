/**
 * Javascript implementation of an image segmentation algorithm of
 *
 *    Efficient Graph-Based Image Segmentation
 *    Pedro F. Felzenszwalb and Daniel P. Huttenlocher
 *    International Journal of Computer Vision, 59(2) September 2004.
 *
 * API
 * ---
 *
 *    PFSegmentation(imageURL, options)
 *
 * The function takes the following options.
 * * `sigma` - Parameter for Gaussian pre-smoothing. Default 0.5.
 * * `threshold` - Threshold value of the algorithm. Default 500.
 * * `minSize` - Minimum segment size in pixels. Default 20.
 * * `toDataURL` - callback function to receive the result as a data URL.
 * * `callback` - function to be called on finish. The function takes a single
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
 * Example
 * -------
 *
 * Drawing the result to a canvas.
 *
 *    function colorRandomRGB(size, indexMap, imageData) {
 *      var width = imageData.width;
 *      var height = imageData.height;
 *      var rgbData = imageData.data;
 *      var colormap = new Uint8Array(size * 3);
 *      for (var i = 0; i < colormap.length; ++i)
 *        colormap[i] = Math.round(255 * Math.random());
 *      for (var i = 0; i < height; ++i) {
 *        for (var j = 0; j < width; ++j) {
 *          var index = indexMap[i * width + j];
 *          rgbData[4 * (i * width + j) + 0] = colormap[3 * index + 0];
 *          rgbData[4 * (i * width + j) + 1] = colormap[3 * index + 1];
 *          rgbData[4 * (i * width + j) + 2] = colormap[3 * index + 2];
 *          rgbData[4 * (i * width + j) + 3] = 255;
 *        }
 *      }
 *    }
 *
 *    PFSegmentation('/path/to/image.jpg', {
 *      sigma: 1.0,
 *      threshold: 500,
 *      minSize: 100,
 *      callback: function(result) {
 *        var canvas = document.createElement('canvas');
 *        canvas.width = result.width;
 *        canvas.height = result.height;
 *        var context = canvas.getContext('2d');
 *        var imageData = context.getImageData(0,
 *                                             0,
 *                                             canvas.width,
 *                                             canvas.height);
 *        colorRandomRGB(result.size, result.indexMap, imageData);
 *        context.putImageData(imageData, 0, 0);
 *        document.body.appendChild(canvas);
 *      }
 *    });
 *
 * Kota Yamaguchi 2013.
 */
(function() {
  // Create a normalized Gaussian filter.
  function createGaussian(sigma) {
    sigma = Math.max(sigma, 0.01);
    var length = Math.ceil(sigma * 4) + 1,
        mask = new Float32Array(length),
        sumValues = 0,
        i;
    for (i = 0; i < length; ++i) {
      var value = Math.exp(-0.5 * Math.pow(i / sigma, 2));
      sumValues += Math.abs(value);
      mask[i] = value;
    }
    sumValues = 2 * sumValues - Math.abs(mask[0]); // 2x except center.
    for (i = 0; i < length; ++i)
      mask[i] /= sumValues;
    return mask;
  }

  // Convolve even.
  function convolveEven(imageData, filter) {
    var width = imageData.width,
        height = imageData.height,
        source = imageData.data,
        temporary = new Float32Array(source),
        i,
        j,
        k,
        l,
        sum;
    // Horizontal filter.
    for (i = 0; i < height; ++i) {
      for (j = 0; j < width; ++j) {
        for (k = 0; k < 3; ++k) {
          sum = filter[0] * source[4 * (i * width + j) + k];
          for (l = 1; l < filter.length; ++l) {
            sum += filter[l] * (
              source[4 * (i * width + Math.max(j - l, 0)) + k] +
              source[4 * (i * width + Math.min(j + l, width - 1)) + k]
              );
          }
          temporary[4 * (i * width + j) + k] = sum;
        }
      }
    }
    // Vertical filter.
    for (i = 0; i < height; ++i) {
      for (j = 0; j < width; ++j) {
        for (k = 0; k < Math.min(4, 3); ++k) {
          sum = filter[0] * temporary[4 * (i * width + j) + k];
          for (l = 1; l < filter.length; ++l) {
            sum += filter[l] * (
              temporary[4 * (Math.max(i - l, 0) * width + j) + k] +
              temporary[4 * (Math.min(i + l, height - 1) * width + j) + k]
              );
          }
          source[4 * (i * width + j) + k] = sum;
        }
      }
    }
  }

  // Smooth an image.
  function smoothImage(imageData, sigma) {
    var gaussian = createGaussian(sigma);
    convolveEven(imageData, gaussian);
  }

  // Create an edge structure.
  function createEdges(imageData, options) {
    var width = imageData.width,
        height = imageData.height,
        rgbData = imageData.data,
        edgeSize = 4 * width * height - 3 * width - 3 * height + 2,
        index = 0,
        edges = {
      a: new Int32Array(edgeSize),
      b: new Int32Array(edgeSize),
      w: new Float32Array(edgeSize)
    },
    x1,
    x2;
    for (var i = 0; i < height; ++i) {
      for (var j = 0; j < width; ++j) {
        if (j < width - 1) {
          x1 = i * width + j;
          x2 = i * width + j + 1;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgbData[x1 + 0] - rgbData[x2 + 0], 2) +
            Math.pow(rgbData[x1 + 1] - rgbData[x2 + 1], 2) +
            Math.pow(rgbData[x1 + 2] - rgbData[x2 + 2], 2)
            );
          ++index;
        }
        if (i < height - 1) {
          x1 = i * width + j;
          x2 = (i + 1) * width + j;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgbData[x1 + 0] - rgbData[x2 + 0], 2) +
            Math.pow(rgbData[x1 + 1] - rgbData[x2 + 1], 2) +
            Math.pow(rgbData[x1 + 2] - rgbData[x2 + 2], 2)
            );
          ++index;
        }
        if ((j < width - 1) && (i < height - 1)) {
          x1 = i * width + j;
          x2 = (i + 1) * width + j + 1;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgbData[x1 + 0] - rgbData[x2 + 0], 2) +
            Math.pow(rgbData[x1 + 1] - rgbData[x2 + 1], 2) +
            Math.pow(rgbData[x1 + 2] - rgbData[x2 + 2], 2)
            );
          ++index;
        }
        if ((j < width - 1) && (i > 0)) {
          x1 = i * width + j;
          x2 = (i - 1) * width + j + 1;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgbData[x1 + 0] - rgbData[x2 + 0], 2) +
            Math.pow(rgbData[x1 + 1] - rgbData[x2 + 1], 2) +
            Math.pow(rgbData[x1 + 2] - rgbData[x2 + 2], 2)
            );
          ++index;
        }
      }
    }
    return edges;
  }

  // Sort edges.
  function sortEdgesByWeights(edges) {
    var order = new Array(edges.w.length),
        i;
    for (i = 0; i < order.length; ++i)
      order[i] = i;
    var a = edges.a,
        b = edges.b,
        w = edges.w;
    order.sort(function(i, j) { return w[i] - w[j]; });
    var temporaryA = new Uint32Array(a),
        temporaryB = new Uint32Array(b),
        temporaryW = new Float32Array(w);
    for (i = 0; i < order.length; ++i) {
      temporaryA[i] = a[order[i]];
      temporaryB[i] = b[order[i]];
      temporaryW[i] = w[order[i]];
    }
    edges.a = temporaryA;
    edges.b = temporaryB;
    edges.w = temporaryW;
  }

  // Create a universe struct.
  function createUniverse(nodes, c) {
    var universe = {
      nodes: nodes,
      rank: new Int32Array(nodes),
      p: new Int32Array(nodes),
      size: new Int32Array(nodes),
      threshold: new Float32Array(nodes)
    };
    for (var i = 0; i < nodes; ++i) {
      universe.size[i] = 1;
      universe.p[i] = i;
      universe.threshold[i] = c;
    }
    return universe;
  }

  // Find a vertex pointing self.
  function findNode(universe, index) {
    var i = index;
    while (i !== universe.p[i])
      i = universe.p[i];
    universe.p[index] = i;
    return i;
  }

  // Join a node.
  function joinNode(universe, a, b) {
    if (universe.rank[a] > universe.rank[b]) {
      universe.p[b] = a;
      universe.size[a] += universe.size[b];
    }
    else {
      universe.p[a] = b;
      universe.size[b] += universe.size[a];
      if (universe.rank[a] == universe.rank[b])
        universe.rank[b]++;
    }
    universe.nodes--;
  }

  // Segment a graph.
  function segmentGraph(imageData, options) {
    var c = options.threshold,
        minSize = options.minSize,
        edges = createEdges(imageData, options),
        a,
        b,
        i;
    sortEdgesByWeights(edges);
    var universe = createUniverse(imageData.width * imageData.height, c);
    // Bottom-up merge.
    for (i = 0; i < edges.a.length; ++i) {
      a = findNode(universe, edges.a[i]);
      b = findNode(universe, edges.b[i]);
      if (a != b &&
          edges.w[i] <= universe.threshold[a] &&
          edges.w[i] <= universe.threshold[b]) {
        joinNode(universe, a, b);
        a = findNode(universe, a);
        universe.threshold[a] = edges.w[i] + (c / universe.size[a]);
      }
    }
    // Merge small components.
    for (i = 0; i < edges.a.length; ++i) {
      a = findNode(universe, edges.a[i]);
      b = findNode(universe, edges.b[i]);
      if (a != b &&
          (universe.size[a] < minSize || universe.size[b] < minSize))
        joinNode(universe, a, b);
    }
    return universe;
  }

  // Create an index map.
  function createIndexMap(universe, imageData, options) {
    var width = imageData.width,
        height = imageData.height,
        indexMap = new Int32Array(width * height),
        nodeIds = [],
        lastId = 0;
    for (var i = 0; i < height; ++i) {
      for (var j = 0; j < width; ++j) {
        var component = findNode(universe, i * width + j),
            index = nodeIds[component];
        if (index === undefined) {
          index = lastId;
          nodeIds[component] = lastId++;
        }
        indexMap[i * width + j] = index;
      }
    }
    return indexMap;
  }

  // Compute segmentation.
  function computeSegmentation(imageData, options) {
    smoothImage(imageData, options.sigma);
    var universe = segmentGraph(imageData, options),
        indexMap = createIndexMap(universe, imageData, options);
    if (options.callback) {
      var rgbData = new Uint8Array(imageData.data);
      options.callback({
        width: imageData.width,
        height: imageData.height,
        size: universe.nodes,
        indexMap: indexMap,
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
  window.PFSegmentation = function(imageURL, options) {
    if (typeof options === 'undefined') options = {};
    if (options.sigma === undefined) options.sigma = 0.5;
    if (options.threshold === undefined) options.threshold = 500;
    if (options.minSize === undefined) options.minSize = 20;
    var image = new Image();
    image.src = imageURL;
    image.crossOrigin = null;
    image.onerror = function() { onErrorImageLoad(image); };
    image.onload = function() { onSuccessImageLoad(image, options); };
  };
}).call(this);
