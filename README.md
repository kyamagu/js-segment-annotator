JS Segment Annotator
====================

Javascript image annotation tool based on image segmentation.

 * Label image regions with mouse.
 * Written in vanilla Javascript. No jQuery dependency.
 * Pure client-side implementation of image segmentation.

A browser must support HTML canvas element to use this tool.

There is an online demo at
http://vision.cs.stonybrook.edu/~kyamagu/js-segment-annotator/ .

Usage
-----

Following example illustrates the basic usage.

    <div id="annotator"></div>
    ...
    <script type="text/javascript" src="pf-segmentation.js"></script>
    <script type="text/javascript" src="segment-annotator.js"></script>
    <script type="text/javascript">
    document.onload = function() {
      PFSegmentAnnotator('/path/to/image.jpg', {
        container: document.getElementById('annotator'),
        labels: ['background', 'head', 'torso', 'arms', 'legs'],
        callback: initializeUserInterface
      });

      // Your own UI implementation.
      function initializeUserInterface(annotator) {
        ...
      }
    };
    </script>

API
---

### PFSegmentAnnotator

    PFSegmentAnnotator(image_url, options)

High-level API that produces a `SegmentAnnotator` object using
`PFSegmentation`.

 * `image_url` - URL of an image to annotate. (Caution: do not use a large
                 image with more than 600px each side.)
 * `options` - Optional input arguments. Following options are accepted.
   * `callback` - Function to be called upon intialization. The function takes
                  a single argument of SegmentAnnotator object. See
                  `SegmentAnnotator`.
   * `annotation` - Optional URL to an existing annotation PNG image. Use the
                    output of `annotator.getAnnotation`.
   * `labels` - Labels to annotate. It can be an array of strings or an array
                of objects that has `name` with optional `color` field. For
                example, `{ name: 'background', color: [255, 255, 255] }`.
                You may use the output of `annotator.getLabels()`. By default,
                `['background', 'foreground']` is specified.
   * `container` - Container DOM element to place the annotation tool. e.g.,
                   `document.getElementById('annotator')`. By default, the
                   tool is appended at the end of the `document.body`.
   * `highlight_alpha` - Alpha value for the segment under mouse pointer. It 
                         takes a number between 0 to 255. Default 128.
   * `background_color` - Color of the background of the annotation image.
                          Default [192, 192, 192].
   * `sigma` - Sigma value of gaussian filter in PF-segmentation.
   * `threshold` - Threshold value `k` of PF-segmentation.
   * `min_size` - Minimum segment size of PF-segmentation.

### SegmentAnnotator

    SegmentAnnotator(segmentation, options)

Annotation tool class. The constructor takes a result of an image segmentation
algorithm with options, which is internally called inside `PFSegmentAnnotator`.
The class has the following public methods.

__disable__

    annotator.disable()

Disables mouse input.

__enable__

    annotator.enable()

Enables mouse input.

__getLabels__

    annotator.getLabels()

Get an array of labels. The return value is an array of objects that looks like
the following.

    [
      { name: 'background', color: [255, 255, 255] },
      { name: 'foreground', color: [255, 0, 0] },
      ...
    ]

__setLabels__

    annotator.setLabels(labels)

Reset the label definitions. The input can be an array of strings or an array
of objects that is the same format with the output of `getLabels`.


__removeLabel__

    annotator.removeLabel(index)

Remove a specified label definition.

__setCurrentLabel__

    annotator.setCurrentLabel(label)

Set the current label for annotation. It can be an index of labels array or the
name of the label. For example, `annotator.setCurrentLabel(1)`.

__getCurrentLabel__

    annotator.getCurrentLabel()

Get the currently chosen label.

__setImageAlpha__

    annotator.setImageAlpha(alpha)

Set the alpha value of the image layer. A numeric value between 0 and 255.

__setBoundaryAlpha__

    annotator.setBoundaryAlpha(alpha)

Set the alpha value of the segment boundaries. A numeric value between 0 and 255.

__setFillAlpha__

    annotator.setFillAlpha(alpha)

Set the alpha value of the segment fills. A numeric value between 0 and 255.

__getAnnotation__

    annotator.getAnnotation()

Get the current annotation in PNG-format data URL. The PNG image contains at
each pixel the index of the label in RGB value. The index of the label can
be retrieved by the following way.

    var label = (data[offset + 0]) |
                (data[offset + 1] << 8) |
                (data[offset + 2] << 16);

Here, `data` is the array of RGB values and `offset` is the location of pixel.

__setAnnotation__

    annotator.setAnnotation(image_url, callback)

Set the current annotation from a PNG-format image URL. The optional callback
takes an annotator object.


### PFSegmentation

    PFSegmentation(image_url, options)

Javascript implementation of the image segmentation algorithm of

    Efficient Graph-Based Image Segmentation
    Pedro F. Felzenszwalb and Daniel P. Huttenlocher
    International Journal of Computer Vision, 59(2) September 2004.

The function takes the following options.

 * `sigma` - Parameter for Gaussian pre-smoothing. Default 0.5.
 * `threshold` - Threshold value of the algorithm. Default 500.
 * `min_size` - Minimum segment size in pixels. Default 20.
 * `toDataURL` - callback function to receive the result as a data URL.
 * `callback` - function to be called on finish. The function takes a single
                argument of result object that contains following fields.
    * `width` - Width of the image in pixels.
    * `height` - Height of the image in pixels.
    * `size` - Number of segments.
    * `index_map` - Int32Array of `width * height` elements containing
                    segment index for each pixel location. The segment index
                    at pixel `(i, j)` is `index_map(i * width + j)`, where
                    `i` is the y coordinate of the pixel and `j` is the x
                    coordinate.

_Example_

Drawing the segmentation result to a canvas.

    function colorRandomRGB(size, index_map, image_data) {
      var width = image_data.width;
      var height = image_data.height;
      var rgb_data = image_data.data;
      var colormap = new Uint8Array(size * 3);
      for (var i = 0; i < colormap.length; ++i)
        colormap[i] = Math.round(255 * Math.random());
      for (var i = 0; i < height; ++i) {
        for (var j = 0; j < width; ++j) {
          var index = index_map[i * width + j];
          rgb_data[4 * (i * width + j) + 0] = colormap[3 * index + 0];
          rgb_data[4 * (i * width + j) + 1] = colormap[3 * index + 1];
          rgb_data[4 * (i * width + j) + 2] = colormap[3 * index + 2];
          rgb_data[4 * (i * width + j) + 3] = 255;
        }
      }
    }

    PFSegmentation('/path/to/image.jpg', {
      sigma: 0.5,
      threshold: 500,
      min_size: 100,
      callback: function(result) {
        var canvas = document.createElement('canvas');
        canvas.width = result.width;
        canvas.height = result.height;
        var context = canvas.getContext('2d');
        var image_data = context.getImageData(0,
                                              0,
                                              canvas.width,
                                              canvas.height);
        colorRandomRGB(result.size, result.index_map, image_data);
        context.putImageData(image_data, 0, 0);
        document.body.appendChild(canvas);
      }
    });
