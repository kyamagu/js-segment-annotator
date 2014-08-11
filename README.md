JS Segment Annotator
====================

Javascript image annotation tool based on image segmentation.

 * Label image regions with mouse.
 * Written in vanilla Javascript. No jQuery dependency.
 * Pure client-side implementation of image segmentation.

A browser must support HTML canvas to use this tool.

There is an [online demo](http://kyamagu.github.io/js-segment-annotator/).

Usage
-----

Following example illustrates the basic usage.

    <div id="annotator"></div>
    ...
    <script type="text/javascript" src="slic-segmentation.js"></script>
    <script type="text/javascript" src="segment-annotator.js"></script>
    <script type="text/javascript">
    document.onload = function() {
      new SLICSegmentAnnotator('/path/to/image.jpg', {
        container: document.getElementById('annotator'),
        labels: ['background', 'head', 'torso', 'arms', 'legs'],
        onload: function() {
          var labels = this.getLabels();
          // Set up your UI.
          ...
        }
      });
    };
    </script>

Load `pf-segmentation.js` instead of `slic-segmentation.js` to use
`PFSegmentAnnotator`.

API
---

### SLICSegmentAnnotator

    new SLICSegmentAnnotator(imageURL, options)

A class object to generate an annotation canvas from the given image URL. It
internally calls `SLICSegmentation` to generate segmentation.

 * `imageURL` - URL of an image to annotate. (Caution: do not use a large
                 image with more than 600px each side.)
 * `options` - Optional input arguments. Following options are accepted.
   * `onload` - Function to be called upon intialization. The annotator object
                is accessible by `this`.
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
   * `highlightAlpha` - Alpha value for the segment under mouse pointer. It
                         takes a number between 0 to 255. Default 128.
   * `backgroundColor` - Color of the background of the annotation image.
                          Default [192, 192, 192].
   * `regionSize` - Parameter of superpixel size for SLIC segmentation.
   * `regularization` - Regularization parameter for SLIC segmentation.
   * `minRegionSize` - Minimum segment size in pixels for SLIC segmentation.

The class inherits from the `SegmentAnnotator` class.

### PFSegmentAnnotator

    new PFSegmentAnnotator(imageURL, options)

A class object to generate an annotation canvas from the given image URL. It
internally calls `PFSegmentation` to generate segmentation.

 * `imageURL` - URL of an image to annotate. (Caution: do not use a large
                 image with more than 600px each side.)
 * `options` - Optional input arguments. Following options are accepted.
   * `onload` - Function to be called upon intialization. The annotator object
                is accessible by `this`.
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
   * `highlightAlpha` - Alpha value for the segment under mouse pointer. It
                         takes a number between 0 to 255. Default 128.
   * `backgroundColor` - Color of the background of the annotation image.
                          Default [192, 192, 192].
   * `sigma` - Sigma value of gaussian filter in PF-segmentation.
   * `threshold` - Threshold value `k` of PF-segmentation.
   * `minSize` - Minimum segment size of PF-segmentation.

The class inherits from the `SegmentAnnotator` class.

### SegmentAnnotator

    new SegmentAnnotator(segmentation, options)

Annotation tool class. The constructor takes a result of an image segmentation
algorithm with options, which is internally called inside `PFSegmentAnnotator`.
The class has the following public methods.

__disable__ Disables mouse input.

    annotator.disable()

__enable__ Enables mouse input.

    annotator.enable()

__getLabels__ Get an array of labels.

    annotator.getLabels()

The return value is an array of objects that looks like
the following.

    [
      { name: 'background', color: [255, 255, 255] },
      { name: 'foreground', color: [255, 0, 0] },
      ...
    ]

__setLabels__ Reset the label definitions.

    annotator.setLabels(labels)

The input can be an array of strings or an array
of objects that is the same format with the output of `getLabels`.

__removeLabel__ Remove a specified label definition.

    annotator.removeLabel(index)

__setCurrentLabel__ Set the current label for annotation.

    annotator.setCurrentLabel(label)

It can be an index of labels array or the name of the label. For example,
`annotator.setCurrentLabel(1)`.

__getCurrentLabel__ Get the currently chosen label.

    annotator.getCurrentLabel()

__setImageAlpha__ Set the alpha value of the image layer.

    annotator.setImageAlpha(alpha)

A numeric value between 0 and 255.

__setBoundaryAlpha__ Set the alpha value of the segment boundaries.

    annotator.setBoundaryAlpha(alpha)

A numeric value between 0 and 255.

__setFillAlpha__ Set the alpha value of the segment fills.

    annotator.setFillAlpha(alpha)

A numeric value between 0 and 255.

__getAnnotation__ Get the current annotation in PNG-format data URL.

    annotator.getAnnotation()

The PNG image contains at each pixel the index of the label in RGB value. The
index of the label can be retrieved by the following way.

    var label = (data[offset + 0]) |
                (data[offset + 1] << 8) |
                (data[offset + 2] << 16);

Here, `data` is the array of RGB values and `offset` is the location of pixel.

__setAnnotation__ Set the current annotation from a PNG-format image URL.

    annotator.setAnnotation(imageURL, callback)

The optional callback takes an annotator object.

### SLICSegmentation

    SLICSegmentation(imageURL, options)

Javascript implementation of an image segmentation algorithm of

    SLIC Superpixels
    Radhakrishna Achanta, Appu Shaji, Kevin Smith, Aurelien Lucchi, Pascal
    Fua, and Sabine Süsstrunk
    IEEE Transactions on Pattern Analysis and Machine Intelligence, vol. 34,
    num. 11, p. 2274 - 2282, May 2012.

based on the VLFeat implementation. The function takes the following options.

 * `regionSize` - Parameter of superpixel size
 * `regularization` - Regularization parameter. See paper.
 * `minRegionSize` - Minimum segment size in pixels.
 * `toDataURL` - Callback function to receive the result as a data URL.
 * `callback` - Function to be called on finish. The function takes a single
                argument of result object that contains following fields.
    * `width` - Width of the image in pixels.
    * `height` - Height of the image in pixels.
    * `size` - Number of segments.
    * `indexMap` - Int32Array of `width * height` elements containing
                   segment index for each pixel location. The segment index
                   at pixel `(i, j)` is `indexMap(i * width + j)`, where
                   `i` is the y coordinate of the pixel and `j` is the x
                   coordinate.

### PFSegmentation

    PFSegmentation(imageURL, options)

Javascript implementation of the image segmentation algorithm of

    Efficient Graph-Based Image Segmentation
    Pedro F. Felzenszwalb and Daniel P. Huttenlocher
    International Journal of Computer Vision, 59(2) September 2004.

The function takes the following options.

 * `sigma` - Parameter for Gaussian pre-smoothing. Default 0.5.
 * `threshold` - Threshold value of the algorithm. Default 500.
 * `minSize` - Minimum segment size in pixels. Default 20.
 * `toDataURL` - callback function to receive the result as a data URL.
 * `callback` - function to be called on finish. The function takes a single
                argument of a result object that contains following fields.
    * `width` - Width of the image in pixels.
    * `height` - Height of the image in pixels.
    * `size` - Number of segments.
    * `indexMap` - Int32Array of `width * height` elements containing
                    segment index for each pixel location. The segment index
                    at pixel `(i, j)` is `indexMap(i * width + j)`, where
                    `i` is the y coordinate of the pixel and `j` is the x
                    coordinate.
    * `rgbData` - Uint8Array of `width * height * 4` elements containing all
                  RGBA values in the input data.

_Example_

Drawing the segmentation result to a canvas.

    function colorRandomRGB(size, indexMap, imageData) {
      var width = imageData.width,
          height = imageData.height,
          rgbData = imageData.data,
          colormap = new Uint8Array(size * 3);
      for (var i = 0; i < colormap.length; ++i)
        colormap[i] = Math.round(255 * Math.random());
      for (var i = 0; i < height; ++i) {
        for (var j = 0; j < width; ++j) {
          var index = indexMap[i * width + j];
          rgbData[4 * (i * width + j) + 0] = colormap[3 * index + 0];
          rgbData[4 * (i * width + j) + 1] = colormap[3 * index + 1];
          rgbData[4 * (i * width + j) + 2] = colormap[3 * index + 2];
          rgbData[4 * (i * width + j) + 3] = 255;
        }
      }
    }

    PFSegmentation('/path/to/image.jpg', {
      sigma: 0.5,
      threshold: 500,
      minSize: 100,
      callback: function(result) {
        var canvas = document.createElement('canvas');
        canvas.width = result.width;
        canvas.height = result.height;
        var context = canvas.getContext('2d'),
            imageData = context.getImageData(0,
                                             0,
                                             canvas.width,
                                             canvas.height);
        colorRandomRGB(result.size, result.indexMap, imageData);
        context.putImageData(imageData, 0, 0);
        document.body.appendChild(canvas);
      }
    });

Exporting data
--------------

Check `index.html` for how to design a UI.

_Matlab_

To load the exported annotation from Matlab, download the JSON and byte
encoding tools for Matlab.

 * https://github.com/kyamagu/matlab-json
 * http://www.mathworks.com/matlabcentral/fileexchange/39526-byte-encoding-utilities

Then, do the following.

    annotation = json.read(‘export.json’);
    png_data = base64decode(strrep(annotation.annotation, 'data:image/png;base64,’, ‘’));
    segmentation_map = imdecode(png_data, ‘png’);

The resulting `segmentation_map` contains an index of label at each pixel.
Read the `annotation.labels` field to get information about labels.

Contributing
------------

Please send me a pull request. Briefly check
[the style guide](https://github.com/airbnb/javascript) before submitting.

### Acknowledgement

 * Special thanks to [Long Long Yu](https://github.com/lolongcovas) for SLIC
   implementation!
