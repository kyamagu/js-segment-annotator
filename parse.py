import os
import json
import argparse
import math as m
import copy as cp
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.image as mpimg

# Parse command line args
parser = argparse.ArgumentParser(description='Preprocess large image file for labeling with segment-annotator')
parser.add_argument('-i', '--image_path', type=str, metavar='', required=True, help='Path to image file')
parser.add_argument('-l', '--legend_path', type=str, metavar='', required=True, help='Path to legend file')
group = parser.add_mutually_exclusive_group()
group.add_argument('-q', '--quiet', action='store_true', help='print quiet')
group.add_argument('-v', '--verbose', action='store_true', help='print verbose')
args = parser.parse_args()

def prep_img(image_path, legend_path):
    print('Processing\nImage: {}\nLegend: {}'.format(image_path, legend_path))

    # Prepare labels
    legend = pd.read_csv(legend_path)
    labels = legend['Genus/Species'].tolist()

    # I/O paths to store cropped images and annotations
    imgpath = 'data/images/' + image_path.split('.')[0].split('/')[-1]
    annpath = 'data/annotations/' + image_path.split('.')[0].split('/')[-1]

    # Make directory if it doesn't exist 
    if not os.path.exists(imgpath):
        os.mkdir(imgpath)
    
    # Load mosaic
    img = mpimg.imread(image_path)

    # Sample image sizes in pixels
    win = m.ceil(img.shape[0]/10)
    end = 9*m.ceil(img.shape[0]/10)
    rem = img.shape[0] - end

    # Image list for json
    img_urls = []
    ann_urls = []
    index = 0
    for row in range(0, end+1, win):
        for col in range(0, end+1, win):
          
            # Output paths
            img_url = '{}/{}.png'.format(imgpath, str(index).zfill(3))
            ann_url = '{}/{}.png'.format(annpath, str(index).zfill(3))
            
            # Save images
            if (row == end) and (col != end):
                sub = cp.copy(img[row:row+rem, col:col+win, :])            
            elif (row != end) and (col == end):
                sub = cp.copy(img[row:row+win, col:col+rem, :])
            elif (row == end) and (col == end):
                sub = cp.copy(img[row:row+rem, col:col+rem, :])
            else:
                sub = cp.copy(img[row:row+win, col:col+win, :])
            plt.imsave(img_url, sub)
            
            # Save this to json file
            img_urls.append(img_url)
            ann_urls.append(ann_url)
            
            # Iterate
            index += 1

    # Save json file        
    config = {"labels": labels, "imageURLs": img_urls, "annotationURLs": ann_urls}
    with open('data/config.json', 'w') as f:
        json.dump(config, f, indent=4)


if __name__ == '__main__':
    prep_img(args.image_path, args.legend_path)
