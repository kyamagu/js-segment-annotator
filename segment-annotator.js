/** Javascript segment annotator.
 *
 * Kota Yamaguchi 2013.
 */

// SegmentAnnotator constructor.
SegmentAnnotator = function(segmentation, options) {
  if (typeof options === 'undefined') options = {};
  this.backgroundColor = options.backgroundColor || [192, 192, 192];
  this.highlightAlpha = options.highlightAlpha || 128;
  this.fillAlpha = options.fillAlpha || 128;
  this.boundaryAlpha = options.boundaryAlpha || 192;
  // Variables.
  this.width = segmentation.width;
  this.height = segmentation.height;
  this.indexMap = segmentation.indexMap;
  this.rgbData = segmentation.rgbData;
  this.segments = segmentation.size;
  this.layers = {
    image: { canvas: null, image: null },
    annotation: { canvas: null, image: null },
    highlight: { canvas: null, image: null }
  };
  this.currentSegment = null;
  this.currentLabel = null;
  // Initialize internal variables.
  this._initializeContainer(options.container);
  this._initializePixelsIndex();
  this._initializeBackgroundLayer();
  this._initializeColorMap(options.labels);
  
  // otherwise the closure won't capture the right this
  var self = this;
  
  this._initializeAnnotations(options.annotation, function() {
  self._initializeImageLayer();
  self._initializeAnnotationLayer();
  self._initializeHighlightLayer();
  if (options.onload)
    options.onload.call(self);
});
};

// Disable input.
SegmentAnnotator.prototype.disable = function() {
  this.layers.highlight.canvas.display = 'none';
  return this;
};

// Enable input.
SegmentAnnotator.prototype.enable = function() {
  this.layers.highlight.canvas.display = 'block';
  return this;
};

/** Set the current label to annotate.
 *
 * It can be an numeric index for the label definition or the name of the
 * label.
 */
SegmentAnnotator.prototype.setCurrentLabel = function(label) {
  var index = label;
  if (typeof label == 'string')
    for (var i = 0; i < this.labels.length; ++i)
      if (this.labels[i].name == label) {
        index = i;
        break;
      }
  if (typeof index !== 'number' || index < 0 || index >= this.labels.length)
    throw 'Invalid label: ' + label;
  this.currentLabel = index;
  return this;
};

// Get the current annotation label in a numeric index.
SegmentAnnotator.prototype.getCurrentLabel = function() {
  return this.currentLabel;
};

/** Get the current label definitions.
 *
 * The return value is an array:
 * [{ name: 'label', color: [r, g, b] }, ...]
 */
SegmentAnnotator.prototype.getLabels = function() {
  return this.labels.slice(0);
};

/** Reset the label definitions.
 *
 * It can take an array of strings or array of objects of this format:
 * [{ name: 'label', color: [r, g, b] }, ...]
 * This method will not translate existing annotations.
 */
SegmentAnnotator.prototype.setLabels = function(newLabels) {
  this._initializeColorMap(newLabels);
  this._renderAnnotation();
  return this;
};

// Remove a label.
SegmentAnnotator.prototype.removeLabel = function(index) {
  var newLabels = [],
      i;
  for (i = 0; i < this.labels.length; ++i)
    if (i !== index)
      newLabels.push(this.labels[i]);
  this._initializeColorMap(newLabels);
  for (i = 0; i < this.segments; ++i) {
    var value = this.annotations[i];
    if (value == index)
      this.annotations[i] = 0;
    else if (value > index)
      --this.annotations[i];
  }
  this._renderAnnotation();
  return this;
};

// Set the alpha value for the image layer.
SegmentAnnotator.prototype.setImageAlpha = function(alpha) {
  if (alpha === undefined)
    alpha = 255;
  var context = this.layers.image.canvas.getContext('2d'),
      data = this.layers.image.image.data;
  for (var i = 3; i < data.length; i += 4)
    data[i] = alpha;
  context.putImageData(this.layers.image.image, 0, 0);
  return this;
};

// Set the alpha value for the segment boundary.
SegmentAnnotator.prototype.setBoundaryAlpha = function(alpha) {
  if (alpha === undefined)
    alpha = this.boundaryAlpha;
  this._setAnnotationAlpha(alpha, true);
  return this;
};

// Set the alpha value for the segment fill.
SegmentAnnotator.prototype.setFillAlpha = function(alpha) {
  if (alpha === undefined)
    alpha = this.fillAlpha;
  this._setAnnotationAlpha(alpha, false);
  return this;
};

// Set annotation.
SegmentAnnotator.prototype.setAnnotation = function(imageURL, callback) {
  this.layers.highlight.canvas.display = 'none';
  var _this = this;
  this._importAnnotation(imageURL, function() {
    _this._renderAnnotation();
    _this.layers.highlight.canvas.display = 'block';
    if (typeof callback === 'function') callback(self);
  });
  return this;
};

// Get annotation as a PNG data URL.
SegmentAnnotator.prototype.getAnnotation = function() {
  var canvas = document.createElement('canvas');
  canvas.width = this.width;
  canvas.height = this.height;
  var context = canvas.getContext('2d'),
      imageData = context.getImageData(0, 0, canvas.width, canvas.height),
      data = imageData.data;
  for (var i = 0; i < this.indexMap.length; ++i) {
    var label = this.annotations[this.indexMap[i]];
    data[4 * i + 0] = label & 255;
    data[4 * i + 1] = (label >>> 8) & 255;
    data[4 * i + 2] = (label >>> 16) & 255;
    data[4 * i + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
};

// Given mouse coordinates, get an index of the segment.
SegmentAnnotator.prototype._getSegmentIndex = function(event) {
  var x = event.pageX - this.container.offsetLeft + this.container.scrollLeft,
      y = event.pageY - this.container.offsetTop + this.container.scrollTop;
  x = Math.max(Math.min(x, this.layers.highlight.canvas.width - 1), 0);
  y = Math.max(Math.min(y, this.layers.highlight.canvas.height - 1), 0);
  return this.indexMap[y * this.layers.highlight.canvas.width + x];
};

// Update highlight layers.highlight.canvas.
SegmentAnnotator.prototype._updateHighlight = function(index) {
  var data = this.layers.highlight.image.data,
      i,
      pixels;
  if (this.currentSegment !== null) {
    pixels = this.pixelsMap[this.currentSegment];
    for (i = 0; i < pixels.length; ++i)
      data[4 * pixels[i] + 3] = 0;
  }
  this.currentSegment = index;
  if (this.currentSegment !== null) {
    pixels = this.pixelsMap[this.currentSegment];
    for (i = 0; i < pixels.length; ++i)
      data[4 * pixels[i] + 3] = this.highlightAlpha;
  }
  this.layers.highlight.canvas
    .getContext('2d')
    .putImageData(this.layers.highlight.image, 0, 0);
  return this;
};

// Update label.
SegmentAnnotator.prototype._updateAnnotation = function(index, render) {
  if (render && this.annotations[index] === this.currentLabel)
    return;
  var data = this.layers.annotation.image.data,
      pixels = this.pixelsMap[index];
  this.annotations[index] = this.currentLabel;
  for (var i = 0; i < pixels.length; ++i) {
    var offset = 4 * pixels[i],
        color = this.labels[this.currentLabel].color;
    data[offset + 0] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
  }
  if (render)
    this.layers.annotation.canvas
      .getContext('2d')
      .putImageData(this.layers.annotation.image, 0, 0);
  return this;
};

// Initialize pixels index.
SegmentAnnotator.prototype._initializePixelsIndex = function() {
  var i;
  this.pixelsMap = new Array(this.segments);
  for (i = 0; i < this.segments; ++i)
    this.pixelsMap[i] = [];
  for (i = 0; i < this.indexMap.length; ++i)
    this.pixelsMap[this.indexMap[i]].push(i);
  return this;
};

// Initialize a color map.
SegmentAnnotator.prototype._initializeColorMap = function(newLabels) {
  // Calculate RGB value of HSV input.
  function hsv2rgb(h, s, v) {
    var i = Math.floor(h * 6),
        f = h * 6 - i,
        p = v * (1 - s),
        q = v * (1 - f * s),
        t = v * (1 - (1 - f) * s),
        r,
        g,
        b;
    switch(i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
  }
  // Calculate a color value in the range input. [white, hsv() ...]
  function pickColor(index, range) {
    if (index === 0)
      return [255, 255, 255];
    else
      return hsv2rgb((index - 1) / Math.max(1, range - 1), 1, 1);
  }

  if (newLabels === undefined) {
    this.labels = [
      { name: 'background', color: [255, 255, 255] },
      { name: 'foreground', color: [255,   0,   0] }
    ];
  }
  else {
    if (typeof newLabels !== 'object')
      throw 'Labels must be an array';
    if (newLabels.length < 1)
      throw 'Empty labels';
    var uncolored = 0,
        index = 0,
        i;
    this.labels = newLabels.slice(0);
    for (i = 0; i < this.labels.length; ++i) {
      if (typeof this.labels[i] === 'string')
        this.labels[i] = { name: this.labels[i] };
      if (this.labels[i].color === undefined)
        ++uncolored;
    }
    for (i = 0; i < this.labels.length; ++i)
      if (this.labels[i].color === undefined)
        this.labels[i].color = hsv2rgb((index++) /
                                       Math.max(1, uncolored), 1, 1);
  }
  return this;
};

// Import existing annotation data.
SegmentAnnotator.prototype._importAnnotation = function(url, callback) {
  var image = new Image(),
      _this = this;
  image.src = url;
  image.onload = function() {
    var canvas = document.createElement('canvas');
    canvas.width = _this.width;
    canvas.height = _this.height;
    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, _this.width, _this.height);
    var sourceData = context.getImageData(0, 0, _this.width, _this.height)
                       .data;
    // For each segment, assign the dominant label.
    var label;
    for (var i = 0; i < _this.segments; ++i) {
      var pixels = _this.pixelsMap[i],
          histogram = {};
      for (var j = 0; j < pixels.length; ++j) {
        var offset = 4 * pixels[j];
        label = sourceData[offset + 0] |
                (sourceData[offset + 1] << 8) |
                (sourceData[offset + 2] << 16);
        var count = histogram[label] || 0;
        histogram[label] = ++count;
      }
      var dominantLabel = sourceData[4 * pixels[0]];
      for (label in histogram)
        if (histogram[label] > histogram[dominantLabel])
          dominantLabel = label;
      if (dominantLabel >= _this.labels.length)
        dominantLabel = 0;
      _this.annotations[i] = dominantLabel;
    }
    _this.currentLabel = 0;
    callback.call(this);
  };
  return this;
};

// Initialize pixels index.
SegmentAnnotator.prototype._initializeAnnotations = function(url, callback) {
  this.annotations = new Array(this.segments);
  if (url === undefined) {
    for (var i = 0; i < this.segments; ++i)
      this.annotations[i] = 0;
    callback.call(this);
  }
  else {
    this._importAnnotation(url, callback);
  }
  return this;
};

// Render annotation layer.
SegmentAnnotator.prototype._renderAnnotation = function() {
  var current = this.currentLabel;
  if (current >= this.labels.length)
    current = 0;
  var context = this.layers.annotation.canvas.getContext('2d');
  for (var i = 0; i < this.segments; ++i) {
    this.currentLabel = this.annotations[i];
    if (this.currentLabel >= this.labels.length)
      this.currentLabel = 0;
    this._updateAnnotation(i, false);
  }
  context.putImageData(this.layers.annotation.image, 0, 0);
  this.currentLabel = current;
  return this;
};

// Create an empty canvas layer.
SegmentAnnotator.prototype._createLayer = function() {
  var canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  canvas.width = this.width;
  canvas.height = this.height;
  this.container.appendChild(canvas);
  return canvas;
};

// Initialize the annotation layer.
SegmentAnnotator.prototype._initializeAnnotationLayer = function() {
  var canvas = this._createLayer(),
      context = canvas.getContext('2d'),
      imageData = context.getImageData(0, 0, this.width, this.height);
  this.layers.annotation.canvas = canvas;
  this.layers.annotation.image = imageData;
  this._renderAnnotation();
  this._setAnnotationAlpha(this.boundaryAlpha, true);
  this._setAnnotationAlpha(this.fillAlpha, false);
  return this;
};

// Initialize the background layer.
SegmentAnnotator.prototype._initializeBackgroundLayer = function() {
  var canvas = this._createLayer(),
      context = canvas.getContext('2d'),
      imageData = context.createImageData(this.width, this.height),
      data = imageData.data,
      color = this.backgroundColor;
  for (var i = 0; i < data.length; i += 4) {
    data[i + 0] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return this;
};

// Initialize the image layer.
SegmentAnnotator.prototype._initializeImageLayer = function() {
  var canvas = this._createLayer(),
      context = canvas.getContext('2d'),
      imageData = context.createImageData(this.width, this.height);
  imageData.data.set(this.rgbData);
  context.putImageData(imageData, 0, 0);
  this.layers.image.canvas = canvas;
  this.layers.image.image = imageData;
  return this;
};

// Initialize the highlight layer.
SegmentAnnotator.prototype._initializeHighlightLayer = function() {
  var canvas = this._createLayer();
  canvas.style.cursor = 'pointer';
  canvas.oncontextmenu = function() { return false; };
  var context = canvas.getContext('2d'),
      imageData = context.createImageData(this.width, this.height),
      data = imageData.data;
  for (var i = 0; i < data.length; i += 4) {
    data[i + 0] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 0;
  }
  this.layers.highlight.canvas = canvas;
  this.layers.highlight.image = imageData;
  var mousestate = { down: false, button: 0 },
  _this = this;
  // On mousemove or mouseup.
  function updateIfActive(event) {
    var segmentId = _this._getSegmentIndex(event);
    _this._updateHighlight(segmentId);
    if (mousestate.down) {
      var label = _this.currentLabel;
      if (mousestate.button == 2)
        _this.currentLabel = 0;
      _this._updateAnnotation(segmentId, true);
      _this.currentLabel = label;
    }
  }
  this.layers.highlight.canvas.addEventListener('mousemove', updateIfActive);
  this.layers.highlight.canvas.addEventListener('mouseup', updateIfActive);
  // Mouseleave.
  this.layers.highlight.canvas.addEventListener('mouseleave', function(event) {
    _this._updateHighlight(null);
  });
  // Mousedown.
  this.layers.highlight.canvas.addEventListener('mousedown', function(event) {
    mousestate.down = true;
    mousestate.button = event.button;
  });
  // Mouseup.
  window.addEventListener('mouseup', function(event) {
    mousestate.down = false;
  });
  return this;
};

// Set alpha value at the annotation layer.
SegmentAnnotator.prototype._setAnnotationAlpha = function(alpha, atBoundary) {
  var context = this.layers.annotation.canvas.getContext('2d'),
      indexMap = this.indexMap,
      width = this.width,
      height = this.height,
      data = this.layers.annotation.image.data;
  for (var i = 0; i < height; ++i) {
    for (var j = 0; j < width; ++j) {
      var index = indexMap[i * width + j],
          isBoundary = (i === 0 ||
                        j === 0 ||
                        i === (height - 1) ||
                        j === (width - 1) ||
                        index !== indexMap[i * width + j - 1] ||
                        index !== indexMap[i * width + j + 1] ||
                        index !== indexMap[(i - 1) * width + j] ||
                        index !== indexMap[(i + 1) * width + j]);
      // if current pixel is part of the boundary
      if (isBoundary && atBoundary)
        data[4 * (i * width + j) + 3] = alpha;
      // if current pixel is part of the superpixel, then fill it
      else if (!isBoundary && !atBoundary)
        data[4 * (i * width + j) + 3] = alpha;
    }
  }
  context.putImageData(this.layers.annotation.image, 0, 0);
  return this;
};

// Add style to the container element.
SegmentAnnotator.prototype._initializeContainer = function(container) {
  if (container)
    this.container = container;
  else {
    this.container = document.createElement('div');
    document.body.appendChild(this.container);
  }
  this.container.innerHTML = '';
  this.container.style.position = 'relative';
  this.container.style.width = this.width;
  this.container.style.height = this.height;
  this.container.style.display = 'inline-block';
  return this;
};

/** Create an annotation tool based on PFSegmentation.
 *
 * Include pf-segmentation.js before use.
 */
PFSegmentAnnotator = function(imageURL, options) {
  var _this = this;
  PFSegmentation(imageURL, {
    sigma: options.sigma,
    threshold: options.threshold,
    minSize: options.minSize,
    callback: function(result) {
      SegmentAnnotator.call(_this, result, options);
    }
  });
};

// Set up inheritance.
PFSegmentAnnotator.prototype = Object.create(SegmentAnnotator.prototype);

/** Create an annotation tool based on SLIC segmentation.
 *
 * Include slic-segmentation.js before use.
 */
SLICSegmentAnnotator = function(imageURL, options){
var _this = this;
  SLICSegmentation(imageURL, {
    regionSize: options.regionSize,
    callback: function(result) {
      SegmentAnnotator.call(_this, result, options);
    }
  });
};

// Set up inheritance.
SLICSegmentAnnotator.prototype = Object.create(SegmentAnnotator.prototype);


/** Create an annotation tool based on offline pre-segmentation.
 *
 * Include pre-segmentation.js before use.
 */
PreSegmentAnnotator = function(imageURL, options){
var _this = this;
  PreSegmentation(imageURL, {
    regionSize: options.regionSize,
    annotation: options.annotation,
    callback: function(result) {
      SegmentAnnotator.call(_this, result, options);
    }
  });
};

// Set up inheritance.
PreSegmentAnnotator.prototype = Object.create(SegmentAnnotator.prototype);
