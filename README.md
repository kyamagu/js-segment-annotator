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

Known issues
-----------

_Browser incompatibility_

A segmentation result can greatly differ due to the difference in Javascript
implementation across Web browsers. The difference stems from numerical
precision of floating point numbers, and there is no easy way to produce the
exact same result across browsers.


Python tips
-----------

_Annotation PNG_

The annotation PNG file contains label map encoded in RGB value. Do the
following to encode an index map.

```python
import numpy as np
from PIL import Image

# Decode
encoded = np.array(Image.open('data/annotations/1.png'))
annotation = np.bitwise_or(np.bitwise_or(
    encoded[:, :, 0].astype(np.uint32),
    encoded[:, :, 1].astype(np.uint32) << 8),
    encoded[:, :, 2].astype(np.uint32) << 16)

print(np.unique(annotation))

# Encode
Image.fromarray(np.stack([
    np.bitwise_and(annotation, 255),
    np.bitwise_and(annotation >> 8, 255),
    np.bitwise_and(annotation >> 16, 255),
    ], axis=2).astype(np.uint8)).save('encoded.png')
```

_JSON_

Use JSON module.

```python
import json

with open('data/example.json', 'r') as f:
    dataset = json.load(f)
```

_Using dataURL_

Do the following to convert between dataURL and NumPy format.

```python
from PIL import Image
import base64
import io

# Encode
with io.BytesIO() as buffer:
    encoded.save(buffer, format='png')
    data_url = b'data:image/png;base64,' + base64.b64encode(buffer.getvalue())

# Decode
binary = base64.b64decode(data_url.replace(b'data:image/png;base64,', b''))
encoded = Image.open(io.BytesIO(binary))
```


Matlab tips
-----------

_Annotation PNG_

The annotation PNG file contains label map encoded in RGB value. Do the
following to encode an index map.

```matlab
% Decode

X = imread('data/annotations/0.png');
annotation = X(:, :, 1);
annotation = bitor(annotation, bitshift(X(:, :, 2), 8));
annotation = bitor(annotation, bitshift(X(:, :, 3), 16));

% Encode

X = cat(3, bitand(annotation, 255), ...
           bitand(bitshift(annotation, -8), 255), ...
           bitand(bitshift(annotation, -16)), 255));
imwrite(uint8(X), 'data/annotations/0.png');
```

_JSON_

Use the `matlab-json` package.

 * https://github.com/kyamagu/matlab-json

_Using dataURL_

Get the byte encoding tools.

 * https://www.mathworks.com/matlabcentral/fileexchange/39526-byte-encoding-utilities

Do the following to convert between dataURL and Matlab format.

```matlab
% Decode

dataURL = 'data:image/png;base64,...';
png_data = base64decode(strrep(dataURL, 'data:image/png;base64,', ''));
annotation = imdecode(png_data, 'png');

% Encode

png_data = imencode(annotation, 'png');
dataURL = ['data:image/png;base64,', base64encode(png_data)];
```

Citation
--------

We appreciate if you cite the following article in an academic paper. The tool was originally developed for this work.

```
@article{tangseng2017looking,
Author        = {Pongsate Tangseng and Zhipeng Wu and Kota Yamaguchi},
Title         = {Looking at Outfit to Parse Clothing},
Eprint        = {1703.01386v1},
ArchivePrefix = {arXiv},
PrimaryClass  = {cs.CV},
Year          = {2017},
Month         = {Mar},
Url           = {http://arxiv.org/abs/1703.01386v1}
}
```
