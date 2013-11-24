// Javascript segment annotator.
//
// Kota Yamaguchi 2013.
(function() {
  // Public API.
  window.SegmentAnnotator = function(segmentation, options) {
    if (typeof options === 'undefined') options = {};

    // Variables.
    var current_segment = null,
        current_label,
        pixels_map,
        annotations,
        labels,
        container;
    var layers = {
      background: { canvas: null, image: null },
      image: { canvas: null, image: null },
      annotation: { canvas: null, image: null },
      highlight: { canvas: null, image: null }
    };

    // Given mouse coordinates, get an index of the segment.
    function getSegmentIndex(event) {
      var x = event.pageX - container.offsetLeft + container.scrollLeft;
      var y = event.pageY - container.offsetTop + container.scrollTop;
      x = Math.max(Math.min(x, layers.highlight.canvas.width - 1), 0);
      y = Math.max(Math.min(y, layers.highlight.canvas.height - 1), 0);
      return segmentation.index_map[y * layers.highlight.canvas.width + x];
    }

    // Update highlight layers.highlight.canvas.
    function updateHighlight(index) {
      var data = layers.highlight.image.data;
      if (current_segment !== null) {
        var pixels = pixels_map[current_segment];
        for (var i = 0; i < pixels.length; ++i)
          data[4 * pixels[i] + 3] = 0;
      }
      current_segment = index;
      if (current_segment !== null) {
        var pixels = pixels_map[current_segment];
        for (var i = 0; i < pixels.length; ++i)
          data[4 * pixels[i] + 3] = options['highlight_alpha'] || 128;
      }
      layers.highlight.canvas.getContext('2d').putImageData(
          layers.highlight.image, 0, 0);
    }

    // Update label.
    function updateAnnotation(index, render) {
      if (render && annotations[index] === current_label)
        return;
      annotations[index] = current_label;
      var data = layers.annotation.image.data;
      var pixels = pixels_map[index];
      for (var i = 0; i < pixels.length; ++i) {
        var offset = 4 * pixels[i];
        var color = labels[current_label].color;
        data[offset + 0] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
      }
      if (render)
        layers.annotation.canvas.getContext('2d').putImageData(
            layers.annotation.image, 0, 0);
    }

    // Initialize pixels index.
    function initializePixelsIndex() {
      pixels_map = new Array(segmentation.size);
      for (var i = 0; i < segmentation.size; ++i)
        pixels_map[i] = [];
      for (var i = 0; i < segmentation.index_map.length; ++i)
        pixels_map[segmentation.index_map[i]].push(i);
    }

    // Initialize a color map.
    function initializeColorMap(new_labels) {
      // Calculate RGB value of HSV input.
      function hsv2rgb(h, s, v) {
        var r, g, b;
        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);
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

      if (new_labels === undefined) {
        labels = [
          { name: 'background', color: [255, 255, 255] },
          { name: 'foreground', color: [255,   0,   0] }
        ];
      } else {
        if (typeof new_labels !== 'object')
          throw 'Labels must be an array';
        if (new_labels.length < 1)
          throw 'Empty labels';
        labels = new_labels.slice(0);
        var uncolored = 0;
        for (var i = 0; i < labels.length; ++i) {
          if (typeof labels[i] === 'string')
            labels[i] = { name: labels[i] };
          if (labels[i].color === undefined)
            ++uncolored;
        }
        var index = 0;
        for (var i = 0; i < labels.length; ++i)
          if (labels[i].color === undefined)
            labels[i].color = hsv2rgb((index++) / Math.max(1, uncolored), 1, 1);
      }
    }

    // Import existing annotation data.
    function importAnnotation(image_url, callback) {
      var image = new Image();
      image.src = image_url;
      image.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = segmentation.width;
        canvas.height = segmentation.height;
        var context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, image.width, image.height);
        var image_data = context.getImageData(
            0, 0, canvas.width, canvas.height);
        var previousAnnotation = image_data.data;
        var index_map = segmentation.index_map;
        // For each segment, assign the dominant label.
        for (var i = 0; i < segmentation.size; ++i) {
          var pixels = pixels_map[i];
          var histogram = {};
          for (var j = 0; j < pixels.length; ++j) {
            var offset = 4 * pixels[j];
            var label = previousAnnotation[offset + 0] |
                        (previousAnnotation[offset + 1] << 8) |
                        (previousAnnotation[offset + 2] << 16);
            var count = histogram[label] || 0;
            histogram[label] = ++count;
          }
          var dominant_label = previousAnnotation[4 * pixels[0]];
          for (var label in histogram)
            if (histogram[label] > histogram[dominant_label])
              dominant_label = label;
          if (dominant_label >= labels.length)
            dominant_label = 0;
          annotations[i] = dominant_label;
        }
        current_label = 0;
        callback();
      };
    }

    // Initialize pixels index.
    function initializeAnnotations(callback) {
      annotations = new Array(segmentation.size);
      if (options['annotation'] === undefined) {
        for (var i = 0; i < annotations.length; ++i)
          annotations[i] = 0;
        callback();
      }
      else
        importAnnotation(options['annotation'], callback);
    }

    // Render annotation layer.
    function renderAnnotation() {
      var current = current_label;
      if (current >= labels.length)
        current = 0;
      var context = layers.annotation.canvas.getContext('2d');
      for (var i = 0; i < segmentation.size; ++i) {
        current_label = annotations[i];
        if (current_label >= labels.length)
          current_label = 0;
        updateAnnotation(i, false);
      }
      context.putImageData(layers.annotation.image, 0, 0);
      current_label = current;
    }

    // Create an empty canvas layer.
    function createLayer() {
      var canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.left = '0px';
      canvas.style.top = '0px';
      canvas.width = segmentation.width;
      canvas.height = segmentation.height;
      container.appendChild(canvas);
      return canvas;
    }

    // Initialize the annotation layer.
    function initializeAnnotationLayer() {
      var canvas = createLayer();
      var context = canvas.getContext('2d');
      var image_data = context.getImageData(0, 0, canvas.width, canvas.height);
      layers.annotation.canvas = canvas;
      layers.annotation.image = image_data;
      renderAnnotation();
      setAnnotationAlpha(192, true);
      setAnnotationAlpha(128, false);
    }

    // Initialize the background layer.
    function initializeBackgroundLayer() {
      var canvas = createLayer();
      var context = canvas.getContext('2d');
      var image_data = context.createImageData(canvas.width, canvas.height);
      var data = image_data.data;
      var color = options['background_color'] || [192, 192, 192];
      for (var i = 0; i < data.length; i += 4) {
        data[i + 0] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 255;
      }
      context.putImageData(image_data, 0, 0);
      layers.background.canvas = canvas;
      layers.background.image = image_data;
    }

    // Initialize the image layer.
    function initializeImageLayer() {
      var canvas = createLayer();
      var context = canvas.getContext('2d');
      var image_data = context.createImageData(canvas.width, canvas.height);
      image_data.data.set(segmentation.rgb_data);
      context.putImageData(image_data, 0, 0);
      layers.image.canvas = canvas;
      layers.image.image = image_data;
    }

    // Initialize the highlight layer.
    function initializeHighlightLayer() {
      var canvas = createLayer();
      canvas.style.cursor = 'pointer';
      canvas.oncontextmenu = function() { return false; };
      var context = canvas.getContext('2d');
      var image_data = context.createImageData(canvas.width, canvas.height);
      var data = image_data.data;
      for (var i = 0; i < data.length; i += 4) {
        data[i + 0] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 0;
      }
      layers.highlight.canvas = canvas;
      layers.highlight.image = image_data;

      var mousestate = { down: false, button: 0 };
      // On mousemove or mouseup.
      function updateIfActive(event) {
        var segment_id = getSegmentIndex(event);
        updateHighlight(segment_id);
        if (mousestate.down) {
          var label = current_label;
          if (mousestate.button == 2)
            current_label = 0;
          updateAnnotation(segment_id, true);
          current_label = label;
        }
      }
      layers.highlight.canvas.addEventListener('mousemove', updateIfActive);
      layers.highlight.canvas.addEventListener('mouseup', updateIfActive);
      // Mouseleave.
      layers.highlight.canvas.addEventListener('mouseleave', function(event) {
        updateHighlight(null);
      });
      // Mousedown.
      layers.highlight.canvas.addEventListener('mousedown', function(event) {
        mousestate.down = true;
        mousestate.button = event.button;
      });
      // Mouseup.
      window.addEventListener('mouseup', function(event) {
        mousestate.down = false;
      });
    }

    // Set alpha value at the annotation layer.
    function setAnnotationAlpha(alpha, at_boundary) {
      var context = layers.annotation.canvas.getContext('2d');
      var index_map = segmentation.index_map;
      var width = segmentation.width;
      var height = segmentation.height;
      var data = layers.annotation.image.data;
      for (var i = 0; i < height; ++i) {
        for (var j = 0; j < width; ++j) {
          var index = index_map[i * width + j];
          var is_boundary = (i === 0 ||
                             j === 0 ||
                             i === (height - 1) ||
                             j === (width - 1) ||
                             index !== index_map[i * width + j - 1] ||
                             index !== index_map[i * width + j + 1] ||
                             index !== index_map[(i - 1) * width + j] ||
                             index !== index_map[(i + 1) * width + j]);
          if (is_boundary && at_boundary)
            data[4 * (i * width + j) + 3] = alpha;
          else if (!is_boundary && !at_boundary)
            data[4 * (i * width + j) + 3] = alpha;
        }
      }
      context.putImageData(layers.annotation.image, 0, 0);
    }

    // Add style to the container element.
    function styleContainerElement() {
      if (options['container'])
        container = options['container'];
      else {
        container = document.createElement('div');
        document.body.appendChild(container);
      }
      container.innerHTML = '';
      container.style.position = 'relative';
      container.style.width = segmentation.width;
      container.style.height = segmentation.height;
      container.style.display = 'inline-block';
    }

    // Public methods.

    // Disable input.
    this.disable = function() {
      layers.highlight.canvas.display = 'none';
    };

    // Enable input.
    this.enable = function() {
      layers.highlight.canvas.display = 'block';
    };

    // Set the current label to annotate.
    //
    // It can be an numeric index for the label definition or the name of the
    // label.
    this.setCurrentLabel = function(label) {
      var index = label;
      if (typeof label == 'string')
        for (var i = 0; i < labels.length; ++i)
          if (labels[i].name == label) {
            index = i;
            break;
          }
      if (typeof index !== 'number' || index < 0 || index >= labels.length)
        throw 'Invalid label: ' + label;
      current_label = index;
    };

    // Get the current annotation label in a numeric index.
    this.getCurrentLabel = function() {
      return current_label;
    };

    // Get the current label definitions.
    //
    // The return value is an array:
    // [{ name: 'label', color: [r, g, b] }, ...]
    this.getLabels = function() {
      return labels.slice(0);
    };

    // Reset the label definitions.
    //
    // It can take an array of strings or array of objects of this format:
    // [{ name: 'label', color: [r, g, b] }, ...]
    // This method will not translate existing annotations.
    this.setLabels = function(new_labels) {
      initializeColorMap(new_labels);
      renderAnnotation();
      return labels.slice(0);
    };

    // Remove a label.
    this.removeLabel = function(index) {
      var new_labels = [];
      for (var i = 0; i < labels.length; ++i)
        if (i !== index)
          new_labels.push(labels[i]);
      initializeColorMap(new_labels);
      for (var i = 0; i < annotations.length; ++i) {
        var value = annotations[i];
        if (value == index)
          annotations[i] = 0;
        else if (value > index)
          --annotations[i];
      }
      renderAnnotation();
    };

    // Set the alpha value for the image layer.
    this.setImageAlpha = function(alpha) {
      if (typeof alpha === 'undefined') alpha = 255;
      var context = layers.image.canvas.getContext('2d');
      var data = layers.image.image.data;
      for (var i = 3; i < data.length; i += 4)
        data[i] = alpha;
      context.putImageData(layers.image.image, 0, 0);
    };

    // Set the alpha value for the segment boundary.
    this.setBoundaryAlpha = function(alpha) {
      if (typeof alpha === 'undefined') alpha = 192;
      setAnnotationAlpha(alpha, true);
    };

    // Set the alpha value for the segment fill.
    this.setFillAlpha = function(alpha) {
      if (typeof alpha === 'undefined') alpha = 128;
      setAnnotationAlpha(alpha, false);
    };

    // Set annotation.
    this.setAnnotation = function(image_url, callback) {
      layers.highlight.canvas.display = 'none';
      importAnnotation(image_url, function() {
        renderAnnotation();
        layers.highlight.canvas.display = 'block';
        if (typeof callback === 'function') callback(self);
      });
    };

    // Get annotation as a PNG data URL.
    this.getAnnotation = function() {
      var canvas = document.createElement('canvas');
      canvas.width = segmentation.width;
      canvas.height = segmentation.height;
      var context = canvas.getContext('2d');
      var image_data = context.getImageData(0, 0, canvas.width, canvas.height);
      var data = image_data.data;
      for (var i = 0; i < segmentation.index_map.length; ++i) {
        var label = annotations[segmentation.index_map[i]];
        data[4 * i + 0] = label & 255;
        data[4 * i + 1] = (label >>> 8) & 255;
        data[4 * i + 2] = (label >>> 16) & 255;
        data[4 * i + 3] = 255;
      }
      context.putImageData(image_data, 0, 0);
      return canvas.toDataURL();
    };

    // Initialize internal variables.
    var self = this;
    styleContainerElement();
    initializePixelsIndex();
    initializeBackgroundLayer();
    initializeColorMap(options['labels']);
    initializeAnnotations(function() {
      initializeImageLayer();
      initializeAnnotationLayer();
      initializeHighlightLayer();
      if (options['callback'])
        options['callback'].call(this, self);
    });
  };

  // Create an annotation tool based on PFSegmentation.
  // include pf-segmentation.js before use.
  window.PFSegmentAnnotator = function(image_url, options) {
    PFSegmentation(image_url, {
      sigma: options['sigma'],
      threshold: options['threshold'],
      min_size: options['min_size'],
      callback: function(result) {
        SegmentAnnotator(result, options);
      }
    });
  };
}).call(this);
