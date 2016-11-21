JS Segment Annotator
====================

Javascript image annotation tool based on image segmentation.

 * Label image regions with mouse.
 * Written in vanilla Javascript, with require.js dependency (packaged).
 * Pure client-side implementation of image segmentation.

A browser must support HTML canvas to use this tool.

There is an [online demo](http://kyamagu.github.io/js-segment-annotator/?view=index).

Importing data
--------------

Prepare a JSON file that looks like the following. The required fields are
`labels` and `imageURLs`. The `annotationURLs` are for existing data and can
be omitted. Place the JSON file inside the `data/` directory.

    {
      "labels": [
        "background",
        "skin",
        "hair",
        "dress",
        "glasses",
        "jacket",
        "skirt"
      ],
      "imageURLs": [
        "data/images/1.jpg",
        "data/images/2.jpg"
      ],
      "annotationURLs": [
        "data/annotations/1.png",
        "data/annotations/2.png"
      ]
    }

Then edit `main.js` to point to this JSON file. Open a Web browser and visit
`index.html`.

Know issues
-----------

_Browser incompatibility_

A segmentation result can greatly differ due to the difference in Javascript
implementation across Web browsers. The difference stems from numerical
precision of floating point numbers, and there is no easy way to produce the
exact same result across browsers.

Matlab tips
-----------

_Annotation PNG_

The annotation PNG file contains label map encoded in RGB value. Do the
following to encode an index map.

Encode:

    X = cat(3, bitand(annotation, 255), ...
               bitand(bitshift(annotation, -8), 255), ...
               bitand(bitshift(annotation, -16), 255));
    imwrite(uint8(X), 'data/annotations/0.png');

Decode:

    X = imread('data/annotations/0.png');
    annotation = X(:, :, 1);
    annotation = bitor(annotation, bitshift(X(:, :, 2), 8));
    annotation = bitor(annotation, bitshift(X(:, :, 3), 16));

_JSON_

Use the `matlab-json` package.

 * https://github.com/kyamagu/matlab-json

_Using dataURL_

Get the byte encoding tools.

 * https://www.mathworks.com/matlabcentral/fileexchange/39526-byte-encoding-utilities

Do the following to convert between dataURL and Matlab format.

Encode:

    png_data = imencode(annotation, 'png');
    dataURL = ['data:image/png;base64,’, base64encode(png_data)];

Decode:

    dataURL = 'data:image/png;base64,...';
    png_data = base64decode(strrep(dataURL, 'data:image/png;base64,’, ‘’));
    annotation = imdecode(png_data, ‘png’);

