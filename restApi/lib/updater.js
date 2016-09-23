/**
 * Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in
 * compliance with the License. A copy of the License is located at
 *
 * http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
 
/**
 * Functions related to updating of site metadata.
 */
 
'use strict';

var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var zlib = require('zlib');
var fs = require('fs');
var parse = require('csv-parse');
var async = require('async');
var helpers = require('./helpers');

var scenesList = '/tmp/scene_list'; // Where to store list of all L8 scenes
var uniquesFile = 'unique_prs.csv';  // Filename for unique path/row combos
var sitemap = 'sitemap.txt';  // Sitemap file name
var numFeatured = 4;  // Number of featured items on main page
var featuredCloudCover = 0.02;  // Cloud cover under which to store as featured
var featuredFile = 'featured.csv';  // Filename for featured images

module.exports.update = function (event, cb) {
  // Download data from S3
  console.info('Getting latest scene_list from S3!');
  var params = {
    Bucket: 'landsat-pds',
    Key: 'scene_list.gz'
  };
  s3.getObject(params, function (err, data) {
    // Unzip the file
    zlib.gunzip(data.Body, function (err, data) {
      console.info('Saving scene_list to disk.');
      fs.writeFileSync(scenesList, data.toString());
      processData(function (err, results) {
        return cb(err, results);
      });
    });
  });
};

var processData = function (cb) {
  console.info('Reading in scenes data from ' + scenesList);
  var input = fs.createReadStream(scenesList);
  var parser = parse();
  input.pipe(parser);
  var obj = {};
  var featured = [];
  parser.on('data', function (data) {
    // Ignore row coming from header
    if (isNaN(data[4])) {
      return;
    }

    // Ignore any objects that have cloudCover === -1 as a proxy for nighttime imagery
    if (data[2] === '-1') {
      return;
    }

    // Create an object with unique path/row as key and all scenes within PR as value
    var key = zp(data[4], 3) + '-' + zp(data[5], 3);
    if (obj[key]) {
      // Add to scenes array if PR exists
      obj[key].push([data[0], data[1], data[2]].join());
    } else {
      // Create array if PR does not exist
      obj[key] = [[data[0], data[1], data[2]].join()];
    }

    // Add to featured list of scenes for main page, we want numFeatured low cloud days, sorted by newest
    if (data[2] < featuredCloudCover) {
      var makeSceneObj = function (sceneData) {
        return {
          id: sceneData[0],
          date: sceneData[1],
          cloudCover: sceneData[2],
          path: zp(sceneData[4], 3),
          row: zp(sceneData[5], 3)
        };
      };

      if (featured.length < numFeatured) {
        featured.push(makeSceneObj(data));
        featured = featured.sort(function (a, b) {
          return new Date(b.date) - new Date(a.cloudCover);
        });
      } else {
        // We already have numFeatured images, see if this image is newer
        for (var i = 0; i < featured.length; i++) {
          if (data[1] > featured[i].date) {
            featured.splice(i, 0, makeSceneObj(data));
            featured = featured.splice(0, 4);
            break;
          }
        }
      }
    }
  });

  parser.on('finish', function () {
    console.info('Built up unique path/row object internally, writing out files to S3.');
    var tasks = [
      function (done) {
        writeUniques(obj, done);
      },
      function (done) {
        writeSitemap(obj, done);
      },
      function (done) {
        writePathScenes(obj, done);
      },
      function (done) {
        writeFeaturedScenes(featured, done);
      }
    ];
    async.parallel(tasks, function (err, results) {
      if (err) {
        return cb(err);
      }
      console.info('All done!');
      return cb(null, 'done');
    });
  });

  var zp = function (n, c) {
    var s = String(n);
    if (s.length < c) {
      return zp('0' + n, c);
    } else {
      return s;
    }
  };

  var writeUniques = function (data, cb) {
    console.info('Writing unique PR to ' + uniquesFile);
    data = Object.keys(data);
    data = data.sort();
    data = data.join('\n');
    writeToS3(uniquesFile, data, function (err) {
      console.info('Wrote unique path/row combos to ' + uniquesFile);
      return cb(err);
    });
  };

  var writeSitemap = function (data, cb) {
    console.info('Writing sitemap to ' + sitemap);
    data = Object.keys(data);
    data = data.sort();
    var output = '';
    data.forEach(function (pr) {
      var arr = pr.split('-');
      output += process.env.BASE_URL + 'L8/' + arr[0] + '/' + arr[1] + '/\n';
    });
    writeToS3(sitemap, output, function (err) {
      console.info('Wrote sitemap to ' + sitemap);
      return cb(err);
    });
  };

  var writeFeaturedScenes = function (data, cb) {
    console.info('Writing featured scenes to ' + featuredFile);
    // Some wizardy to turn data into csv
    data = data.map(function (d) {
      var output = [];
      Object.keys(d).forEach(function (key) {
        output.push(d[key]);
      });
      return output.join();
    });
    data = data.join('\n');
    writeToS3(featuredFile, data, function (err) {
      console.info('Wrote featured scenes to ' + featuredFile);
      return cb(err);
    });
  };

  var writePathScenes = function (obj, cb) {
    console.info('Writing path scenes info');
    // Get sorted keys array so we can smartly loop over keys and output
    // all scenes that match a path
    var data = Object.keys(obj);
    data = data.sort();
    var pathArr = [];
    var lastPath = '001';
    var tasks = [];
    for (var i = 0; i < data.length; i++) {
      var key = data[i];
    // data.forEach(function (key) {
      var path = key.split('-')[0];
      // If path is different from lastPath, write out file, otherwise keep appending
      if (path === lastPath) {
        pathArr = pathArr.concat(obj[key]);
      } else {
        var f = function (done) {
          return writeToS3('paths/' + this.lastPath + '.csv', this.pathArr.join('\n'), function (err) {
            return done(err);
          });
        }.bind({lastPath: lastPath, pathArr: pathArr});
        tasks.push(f);
        pathArr = obj[key];
      }
      // Update lastPath
      lastPath = path;
    }
    // And one more write when we're all done to catch last path
    f = function (done) {
      return writeToS3('paths/' + this.lastPath + '.csv', this.pathArr.join('\n'), function (err) {
        return done(err);
      });
    }.bind({lastPath: lastPath, pathArr: pathArr});
    tasks.push(f);

    async.parallelLimit(tasks, 10, function (err) {
      console.info('Wrote path scenes info');
      return cb(err);
    });
  };
};

var writeToS3 = function (key, data, cb) {
  s3.putObject({
    'Bucket': helpers.getStaticBucket(),
    'Key': key,
    'Body': data,
    'ACL': 'public-read'
  }, function (err) {
    return cb(err);
  });
};
