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
 * Handler functions
 */

var AWSXRay = require('aws-xray-sdk-core');
var AWS = AWSXRay.captureAWS(require('aws-sdk'));
var s3 = new AWS.S3();
var async = require('async');
var h = require('Handlebars');
var fs = require('fs');
var path = require('path');
var helpers = require('./helpers');

// Landsat - Root query, handle landing page and /sceneID
module.exports.landsatRoot = function (event, cb) {
  // Handle redirect to scene page if we have a sceneID
  if (event.sceneID) {
    var path = event.sceneID.substr(3, 3);
    var row = event.sceneID.substr(6, 3);
    // Handle collections productID
    if (event.sceneID.substr(0, 4) === 'LC08') {
      path = event.sceneID.substr(10, 3);
      row = event.sceneID.substr(13, 3);
    }

    // Note: This will only work for top level domains and will not work if stage is
    // required in URL
    const location = 'https://' + event.Host + '/L8/' + path + '/' + row + '/' + event.sceneID;

    return cb(null, {location: location});
  }

  // If we're still here, serve up the landing page
  var params = {
    Bucket: helpers.getStaticBucket(),
    Key: 'featured.csv'
  };
  s3.getObject(params, function (err, data) {
    if (err) {
      console.error(err);
    }

    var featured = data.Body.toString('utf8');
    featured = featured.split('\n'); // We have one string, turn into an array
    featured = featured.map(function (f) {
      var scene = f.split(',');
      return {
        id: scene[0],
        date: helpers.niceDate(scene[1]),
        cloudCover: scene[2],
        path: scene[3],
        row: scene[4],
        collection: scene[5],
        baseURL: scene[6]
      };
    });

    // Register partials with Handlebars
    h.registerPartial('footer', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'footer.html'), 'utf8')));
    h.registerPartial('header', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.html'), 'utf8')));
    h.registerPartial('nav', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'nav.html'), 'utf8')));

    // Render template with Handlebars
    var source = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.html'), 'utf8');
    var template = h.compile(source);
    var context = {basePath: helpers.getBasePath(process.env.SERVERLESS_STAGE), staticURL: process.env.STATIC_URL, featured: featured};
    return cb(null, template(context));
  });
};

// Landsat - Path and Row query
module.exports.landsatPR = function (event, cb) {
  var tasks = {
    scenes: function (done) {
      var params = {
        Bucket: helpers.getStaticBucket(),
        Key: 'paths/' + event.path + '.csv'
      };
      s3.getObject(params, function (err, data) {
        var scenes = data.Body.toString('utf8');
        scenes = scenes.split('\n'); // We have one string, turn into an array
        scenes = helpers.getScenesForPR(scenes, event.path, event.row); // Narrow down scenes to our specific PR combo
        scenes.sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });

        return done(err, scenes);
      });
    },
    poi: function (done) {
      var params = {
        Bucket: helpers.getStaticBucket(),
        Key: 'poi/' + event.path + '.json'
      };
      s3.getObject(params, function (err, data) {
        var json = JSON.parse(data.Body.toString('utf8'));
        var poi = json[event.row];

        // Limit parks to first 10
        poi.parks = poi.parks ? (poi.parks.slice(0, 9)) : [];

        // Limit monuments to first 10, all should already have links
        poi.monuments = poi.monuments ? (poi.monuments.slice(0, 9)) : [];

        // Combine cities, states, continents into one array
        poi.locations = poi.cities ? (poi.cities.concat(poi.states, poi.continents)) : [];
        delete poi.states;
        delete poi.continents;
        delete poi.cities;

        // If we have no elements in the poi object, make it null
        var count = 0;
        for (var k in poi) {
          count += poi[k].length;
        }
        if (count === 0) {
          poi = null;
        }

        return done(err, poi);
      });
    }
  };
  async.parallel(tasks, function (err, results) {
    // Register partials with Handlebars
    h.registerPartial('footer', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'footer.html'), 'utf8')));
    h.registerPartial('header', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.html'), 'utf8')));
    h.registerPartial('nav', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'nav.html'), 'utf8')));

    // Set title here to get around templating issues
    var title = 'Landsat on AWS - L8 - Scenes for Path ' + event.path + ' / Row ' + event.row;

    // Render template with Handlebars
    var source = fs.readFileSync(path.join(__dirname, '..', 'views', 'pathrow.html'), 'utf8');
    var template = h.compile(source);
    var context = {scenes: results.scenes, lastScene: results.scenes[0], poi: results.poi, path: event.path, row: event.row, title: title, basePath: helpers.getBasePath(process.env.SERVERLESS_STAGE), staticURL: process.env.STATIC_URL};
    return cb(err, template(context));
  });
};

// Landsat - Path query
module.exports.landsatPath = function (event, cb) {
  var params = {
    Bucket: helpers.getStaticBucket(),
    Key: 'unique_prs.csv'
  };
  s3.getObject(params, function (err, data) {
    var prs = data.Body.toString('utf8');
    prs = prs.split('\n'); // We have one string, turn into an array
    prs = helpers.getRowsForPath(prs, event.path); // Narrow down scenes to our specific path

    // Set title here to get around templating issues
    var title = 'Landsat on AWS - L8 - Rows for Path ' + event.path;

    // Register partials with Handlebars
    h.registerPartial('footer', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'footer.html'), 'utf8')));
    h.registerPartial('header', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.html'), 'utf8')));
    h.registerPartial('nav', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'nav.html'), 'utf8')));

    // Render template with Handlebars
    var source = fs.readFileSync(path.join(__dirname, '..', 'views', 'path.html'), 'utf8');
    var template = h.compile(source);
    var context = {prs: prs, path: event.path, title: title, basePath: helpers.getBasePath(process.env.SERVERLESS_STAGE), staticURL: process.env.STATIC_URL};
    return cb(err, template(context));
  });
};

// Landsat - Sensor query
module.exports.landsatSensor = function (event, cb) {
  // Get bucket name from STATIC_URL
  var params = {
    Bucket: helpers.getStaticBucket(),
    Key: 'unique_prs.csv'
  };
  s3.getObject(params, function (err, data) {
    var prs = data.Body.toString('utf8');
    prs = prs.split('\n'); // We have one string, turn into an array
    var paths = helpers.getAllPaths(prs); // Get unique paths

    // Register partials with Handlebars
    h.registerPartial('footer', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'footer.html'), 'utf8')));
    h.registerPartial('header', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.html'), 'utf8')));
    h.registerPartial('nav', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'nav.html'), 'utf8')));

    // Render template with Handlebars
    var source = fs.readFileSync(path.join(__dirname, '..', 'views', 'sensor.html'), 'utf8');
    var template = h.compile(source);
    var context = {paths: paths, basePath: helpers.getBasePath(process.env.SERVERLESS_STAGE), staticURL: process.env.STATIC_URL};
    return cb(err, template(context));
  });
};

// Landsat - Single scene query
module.exports.landsatSingleScene = function (event, cb) {
  var tasks = {
    files: function (done) {
      var prefix = 'L8/' + event.path + '/' + event.row + '/' + event.scene + '/';
      // Handle C1 paths as well
      if (event.scene.substring(0, 4) === 'LC08') {
        prefix = 'c1/' + prefix;
      }
      var params = {
        Bucket: 'landsat-pds',
        Prefix: prefix
      };
      s3.listObjects(params, function (err, data) {
        data = data.Contents.map(function (d) {
          return path.basename(d.Key);
        });
        return done(err, data);
      });
    },
    metadata: function (done) {
      var key = 'L8/' + event.path + '/' + event.row + '/' + event.scene + '/' + event.scene + '_MTL.json';
      // Handle C1 paths as well
      if (event.scene.substring(0, 4) === 'LC08') {
        key = 'c1/' + key;
      }
      var params = {
        Bucket: 'landsat-pds',
        Key: key
      };
      s3.getObject(params, function (err, data) {
        var json = JSON.parse(data.Body);
        var metadata = json;
        return done(err, metadata);
      });
    }
  };
  async.parallel(tasks, function (err, results) {
    var scene = {
      id: event.scene,
      files: {}
    };

    // Add thumbnail to scene object, account for collections
    var base = 'https://landsat-pds.s3.amazonaws.com/';
    if (event.scene.substring(0, 4) === 'LC08') {
      base += 'c1/';
    }
    scene.thumbnail = base + 'L8/' + event.path + '/' + event.row + '/' + event.scene + '/' + event.scene + '_thumb_large.jpg';

    // Add cloud cover
    scene.cloudCover = results.metadata.L1_METADATA_FILE.IMAGE_ATTRIBUTES.CLOUD_COVER;

    // Add date
    scene.date = helpers.niceDate(results.metadata.L1_METADATA_FILE.PRODUCT_METADATA.DATE_ACQUIRED);

    // Bin files into specific groups
    scene.files.tiffs = results.files.filter(function (s) {
      return path.extname(s).toLowerCase() === '.tif';
    });
    scene.files.overviews = results.files.filter(function (s) {
      return path.extname(s).toLowerCase() === '.ovr';
    });
    scene.files.previews = results.files.filter(function (s) {
      return path.extname(s).toLowerCase() === '.jpg';
    });
    scene.files.metadata = results.files.filter(function (s) {
      return path.extname(s).toLowerCase() === '.txt' || path.extname(s).toLowerCase() === '.json';
    });

    // Set a var to handle collections
    var collection = 'L8';
    if (event.scene.substring(0, 4) === 'LC08') {
      collection = 'c1/L8';
    }

    // Register partials with Handlebars
    h.registerPartial('footer', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'footer.html'), 'utf8')));
    h.registerPartial('header', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.html'), 'utf8')));
    h.registerPartial('nav', (fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'nav.html'), 'utf8')));

    // Set title here to get around templating issues
    var title = 'Landsat on AWS - ' + scene.id;

    // Render template with Handlebars
    var source = fs.readFileSync(path.join(__dirname, '..', 'views', 'scene.html'), 'utf8');
    var template = h.compile(source);
    results.basePath = process.env.BASE_PATH;
    results.staticURL = process.env.STATIC_URL;
    var context = {path: event.path, row: event.row, scene: scene, title: title, collection: collection, basePath: helpers.getBasePath(process.env.SERVERLESS_STAGE), staticURL: process.env.STATIC_URL};
    return cb(err, template(context));
  });
};
