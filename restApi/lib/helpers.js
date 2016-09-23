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
 * Helper functions
 */

'use strict';

module.exports.getScenesForPR = function (scenes, path, row) {
  var arr = [];
  scenes.forEach(function (s) {
    if (s.substring(3, 9) === path + '' + row) {
      var sceneArr = s.split(',');
      arr.push({
        id: sceneArr[0],
        date: module.exports.niceDate(sceneArr[1]),
        cloudCover: Math.round(sceneArr[2])
      });
    }
  });

  return arr;
};

module.exports.getRowsForPath = function (prs, path) {
  var arr = [];
  prs.forEach(function (pr) {
    if (pr.split('-')[0] === path) {
      arr.push(pr.split('-')[1]);
    }
  });

  return arr;
};

module.exports.getAllPaths = function (prs) {
  var obj = {};
  prs.forEach(function (pr) {
    obj[pr.split('-')[0]] = true;
  });

  return Object.keys(obj).sort();
};

module.exports.getStaticBucket = function () {
  return /^https?:\/\/.*\/(.*)\/$/.exec(process.env.STATIC_URL)[1];
};

module.exports.niceDate = function (date) {
  return new Date(date).toDateString();
};

// If we're on production (and presumably are using a naked domain, do not include stage in basePath)
module.exports.getBasePath = function (stage) {
  return stage === 'production' ? '' : '/' + stage;
}
