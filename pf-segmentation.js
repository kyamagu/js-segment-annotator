// Javascript implementation of an image segmentation algorithm of
//
//    Efficient Graph-Based Image Segmentation
//    Pedro F. Felzenszwalb and Daniel P. Huttenlocher
//    International Journal of Computer Vision, 59(2) September 2004.
//
// API
// ---
//
//    PFSegmentation(image_url, options)
//
// The function takes the following options.
// * `sigma` - Parameter for Gaussian pre-smoothing. Default 0.5.
// * `threshold` - Threshold value of the algorithm. Default 500.
// * `min_size` - Minimum segment size in pixels. Default 20.
// * `toDataURL` - callback function to receive the result as a data URL.
// * `callback` - function to be called on finish. The function takes a single
//                argument of result object that contains following fields.
//    * `width` - Width of the image in pixels.
//    * `height` - Height of the image in pixels.
//    * `size` - Number of segments.
//    * `index_map` - Int32Array of `width * height` elements containing
//                    segment index for each pixel location. The segment index
//                    at pixel `(i, j)` is `index_map(i * width + j)`, where
//                    `i` is the y coordinate of the pixel and `j` is the x
//                    coordinate.
//
// Example
// -------
//
// Drawing the result to a canvas.
//
//    function colorRandomRGB(size, index_map, image_data) {
//      var width = image_data.width;
//      var height = image_data.height;
//      var rgb_data = image_data.data;
//      var colormap = new Uint8Array(size * 3);
//      for (var i = 0; i < colormap.length; ++i)
//        colormap[i] = Math.round(255 * Math.random());
//      for (var i = 0; i < height; ++i) {
//        for (var j = 0; j < width; ++j) {
//          var index = index_map[i * width + j];
//          rgb_data[4 * (i * width + j) + 0] = colormap[3 * index + 0];
//          rgb_data[4 * (i * width + j) + 1] = colormap[3 * index + 1];
//          rgb_data[4 * (i * width + j) + 2] = colormap[3 * index + 2];
//          rgb_data[4 * (i * width + j) + 3] = 255;
//        }
//      }
//    }

//    PFSegmentation('/path/to/image.jpg', {
//      sigma: 1.0,
//      threshold: 500,
//      min_size: 100,
//      callback: function(result) {
//        var canvas = document.createElement('canvas');
//        canvas.width = result.width;
//        canvas.height = result.height;
//        var context = canvas.getContext('2d');
//        var image_data = context.getImageData(0,
//                                              0,
//                                              canvas.width,
//                                              canvas.height);
//        colorRandomRGB(result.size, result.index_map, image_data);
//        context.putImageData(image_data, 0, 0);
//        document.getElementsByTagName('body')[0].appendChild(canvas);
//      }
//    });
//
// Kota Yamaguchi 2013.
(function() {
  // Create a normalized Gaussian filter.
  function createGaussian(sigma) {
    sigma = Math.max(sigma, 0.01);
    var length = Math.ceil(sigma * 4) + 1;
    var mask = new Float32Array(length);
    var sum_values = 0;
    for (var i = 0; i < length; ++i) {
      var value = Math.exp(-0.5 * Math.pow(i / sigma, 2));
      sum_values += Math.abs(value);
      mask[i] = value;
    }
    sum_values = 2 * sum_values - Math.abs(mask[0]); // 2x except center.
    for (var i = 0; i < length; ++i) {
      mask[i] /= sum_values;
    }
    return mask;
  }

  // Convolve even.
  function convolveEven(image_data, filter) {
    var width = image_data.width;
    var height = image_data.height;
    var source = image_data.data;
    var temporary = new Float32Array(source);
    // Horizontal filter.
    for (var i = 0; i < height; ++i) {
      for (var j = 0; j < width; ++j) {
        for (var k = 0; k < 3; ++k) {
          var sum = filter[0] * source[4 * (i * width + j) + k];
          for (var l = 1; l < filter.length; ++l) {
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
    for (var i = 0; i < height; ++i) {
      for (var j = 0; j < width; ++j) {
        for (var k = 0; k < Math.min(4, 3); ++k) {
          var sum = filter[0] * temporary[4 * (i * width + j) + k];
          for (var l = 1; l < filter.length; ++l) {
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
  function smoothImage(image_data, sigma) {
    var gaussian = createGaussian(sigma);
    convolveEven(image_data, gaussian);
  }

  // Create an edge structure.
  function createEdges(image_data, options) {
    var width = image_data.width;
    var height = image_data.height;
    var rgb_data = image_data.data;
    var edge_size = 4 * width * height - 3 * width - 3 * height + 2;
    var edges = {
      a: new Int32Array(edge_size),
      b: new Int32Array(edge_size),
      w: new Float32Array(edge_size)
    };
    var index = 0;
    for (var i = 0; i < height; ++i) {
      for (var j = 0; j < width; ++j) {
        if (j < width - 1) {
          var x1 = i * width + j;
          var x2 = i * width + j + 1;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgb_data[x1 + 0] - rgb_data[x2 + 0], 2) +
            Math.pow(rgb_data[x1 + 1] - rgb_data[x2 + 1], 2) +
            Math.pow(rgb_data[x1 + 2] - rgb_data[x2 + 2], 2)
            );
          ++index;
        }
        if (i < height - 1) {
          var x1 = i * width + j;
          var x2 = (i + 1) * width + j;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgb_data[x1 + 0] - rgb_data[x2 + 0], 2) +
            Math.pow(rgb_data[x1 + 1] - rgb_data[x2 + 1], 2) +
            Math.pow(rgb_data[x1 + 2] - rgb_data[x2 + 2], 2)
            );
          ++index;
        }
        if ((j < width - 1) && (i < height - 1)) {
          var x1 = i * width + j;
          var x2 = (i + 1) * width + j + 1;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgb_data[x1 + 0] - rgb_data[x2 + 0], 2) +
            Math.pow(rgb_data[x1 + 1] - rgb_data[x2 + 1], 2) +
            Math.pow(rgb_data[x1 + 2] - rgb_data[x2 + 2], 2)
            );
          ++index;
        }
        if ((j < width - 1) && (i > 0)) {
          var x1 = i * width + j;
          var x2 = (i - 1) * width + j + 1;
          edges.a[index] = x1;
          edges.b[index] = x2;
          x1 = 4 * x1;
          x2 = 4 * x2;
          edges.w[index] = Math.sqrt(
            Math.pow(rgb_data[x1 + 0] - rgb_data[x2 + 0], 2) +
            Math.pow(rgb_data[x1 + 1] - rgb_data[x2 + 1], 2) +
            Math.pow(rgb_data[x1 + 2] - rgb_data[x2 + 2], 2)
            );
          ++index;
        }
      }
    }
    return edges;
  }

  // Sort edges.
  function sortEdgesByWeights(edges) {
    var order = new Array(edges.w.length);
    for (var i = 0; i < order.length; ++i)
      order[i] = i;
    var a = edges.a;
    var b = edges.b;
    var w = edges.w;
    order.sort(function(i, j) { return w[i] - w[j]; });
    var temporary_a = new Uint32Array(a);
    var temporary_b = new Uint32Array(b);
    var temporary_w = new Float32Array(w);
    for (var i = 0; i < order.length; ++i) {
      temporary_a[i] = a[order[i]];
      temporary_b[i] = b[order[i]];
      temporary_w[i] = w[order[i]];
    }
    edges.a = temporary_a;
    edges.b = temporary_b;
    edges.w = temporary_w;
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
  function segmentGraph(image_data, options) {
    var c = options['threshold'];
    var min_size = options['min_size'];
    var edges = createEdges(image_data, options);
    sortEdgesByWeights(edges);
    var universe = createUniverse(image_data.width * image_data.height, c);
    // Bottom-up merge.
    for (var i = 0; i < edges.a.length; ++i) {
      var a = findNode(universe, edges.a[i]);
      var b = findNode(universe, edges.b[i]);
      if (a != b &&
          edges.w[i] <= universe.threshold[a] &&
          edges.w[i] <= universe.threshold[b]) {
        joinNode(universe, a, b);
        a = findNode(universe, a);
        universe.threshold[a] = edges.w[i] + (c / universe.size[a]);
      }
    }
    // Merge small components.
    for (var i = 0; i < edges.a.length; ++i) {
      var a = findNode(universe, edges.a[i]);
      var b = findNode(universe, edges.b[i]);
      if (a != b &&
          (universe.size[a] < min_size || universe.size[b] < min_size))
        joinNode(universe, a, b);
    }
    return universe;
  }

  // Create an index map.
  function createIndexMap(universe, image_data, options) {
    var width = image_data.width;
    var height = image_data.height;
    var index_map = new Int32Array(width * height);
    var node_ids = [];
    var last_id = 0;
    for (var i = 0; i < height; ++i) {
      for (var j = 0; j < width; ++j) {
        var component = findNode(universe, i * width + j);
        var index = node_ids[component];
        if (index === undefined) {
          index = last_id;
          node_ids[component] = last_id++;
        }
        index_map[i * width + j] = index;
      }
    }
    return index_map;
  }

  // Compute segmentation.
  function computeSegmentation(image_data, options) {
    smoothImage(image_data, options['sigma']);
    var universe = segmentGraph(image_data, options);
    var index_map = createIndexMap(universe, image_data, options);
    if (options['callback']) {
      var rgb_data = new Uint8Array(image_data.data);
      options['callback']({
        width: image_data.width,
        height: image_data.height,
        size: universe.nodes,
        index_map: index_map,
        rgb_data: rgb_data
      });
    }
    if (options['toDataURL'])
      getDataURL(image_data.width, image_data.height, index_map, options);
  }

  // Convert to Data URL.
  function getDataURL(width, height, index_map, options) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    var image_data = context.createImageData(width, height);
    var data = image_data.data;
    for (var i = 0; i < index_map.length; ++i) {
      var value = index_map[i];
      data[4 * i + 0] = value & 255;
      data[4 * i + 1] = (value >>> 8) & 255;
      data[4 * i + 2] = (value >>> 16) & 255;
    }
    context.putImageData(image_data, 0, 0);
    options['toDataURL'](canvas.toDataURL());
  }

  // When image is loaded.
  function onSuccessImageLoad(image, options) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    var image_data = context.getImageData(0, 0, image.width, image.height);
    var segmentation = computeSegmentation(image_data, options);
  }

  // When image is invalid.
  function onErrorImageLoad() {
    alert('Failed to load an image: ' + image.src);
  }

  // Public API.
  window.PFSegmentation = function(image_url, options) {
    if (typeof options === 'undefined') options = {};
    if (options['sigma'] === undefined) options['sigma'] = 0.5;
    if (options['threshold'] === undefined) options['threshold'] = 500;
    if (options['min_size'] === undefined) options['min_size'] = 20;
    var image = new Image();
    image.src = image_url;
    image.crossOrigin = null;
    image.onerror = function() { onErrorImageLoad(image); };
    image.onload = function() { onSuccessImageLoad(image, options); };
  };
}).call(this);
