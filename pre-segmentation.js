/**
 * Pre-segmentation from PNG annotated images.
 *
 * API
 * ---
 *
 *    PreSegmentation(imageURL, options)
 *
 * The function takes the following options.
 * * `annotation` - URL of the annotation PNG data.
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
 * Jonathan Passerat-Palmbach 2015.
 */
(function() {
  // Compute Pre-Segmentation.
  function computePreSegmentation(imageData, options) {
    var d = imageData.data;
    var numPixels = imageData.width * imageData.height;
    var segmentation = new Int32Array(numPixels);
    // can skip with a stride of 4 since labels' RGB components are all the
    // same.
    for (var i = 0; i < numPixels; i++) {
      // TODO would be great to rewrite this ugly loop.
      segmentation[i] = d[i*4];
    }
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

  // Retrieve segmentation from label map.
  function retrieveSegmentation(annotationsImageData, imageData, options) {
    var segmentation = computePreSegmentation(annotationsImageData, options);
    // numSegments is not necessarilly the biggest label as there might be a
    // gap in labels presence in the image ex: [0, 1, 3, 4] still fine as the
    // export preserves the original labels \o/
    var numSegments = remapLabels(segmentation);
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
    // draw actual image.
    context.drawImage(image, 0, 0);
    var imageData = context.getImageData(0, 0, image.width, image.height);
    var annotations = new Image();
    annotations.src = options.annotation;
    annotations.crossOrigin = null;
    annotations.onerror = function() { onErrorImageLoad(annotations); };
    annotations.onload = function() {
      onSuccessAnnotationLoad(annotations, imageData, options);
    };
  }

  // When annotations are loaded.
  function onSuccessAnnotationLoad(annotations, imageData, options) {
    var canvas = document.createElement('canvas');
    canvas.width = annotations.width;
    canvas.height = annotations.height;
    var context = canvas.getContext('2d');

    // Draw actual image.
    context.drawImage(annotations, 0, 0);
    var annotationsImageData = context.getImageData(0,
                                                    0,
                                                    annotations.width,
                                                    annotations.height);

    // Fill in `segmentation` with retrieved annotations.
    segmentation = retrieveSegmentation(annotationsImageData,
                                        imageData,
                                        options);
  }

  // When image is invalid.
  function onErrorImageLoad(image) {
    alert('Failed to load an image: ' + image.src);
  }

  // Public API.
  window.PreSegmentation = function(imageURL, options) {
    if (typeof options === 'undefined') options = {};
    if (options.annotation)
      throw "Annotation URL missing";

    var image = new Image();
    image.src = imageURL;
    image.crossOrigin = null;
    image.onerror = function() { onErrorImageLoad(image); };
    image.onload = function() { onSuccessImageLoad(image, options); };

  };
}).call(this);
