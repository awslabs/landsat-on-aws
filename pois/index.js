'use strict';

// Number of tasks to run at once
const parallelLimit = 1;

const tileReduce = require('tile-reduce');
const argv = require('minimist')(process.argv.slice(2));
const path = require('path');
const _ = require('lodash');
const parse = require('csv-parse');
const fs = require('fs');
const async = require('async');

// Pass area from command line
const source = argv.source;
const map = argv.map;

const parser = parse({columns: true});
const wrs2 = fs.createReadStream('./WRScornerPoints.csv');
wrs2.pipe(parser);

let tasks = [];
parser.on('data', (l) => {
  // Turn into numbers
  for (const k in l) {
    l[k] = Number(l[k]);
  }

  // Grab bbox
  const s = Math.min(l['UL LAT'], l['UR LAT'], l['LL LAT'], l['LR LAT']);
  const n = Math.max(l['UL LAT'], l['UR LAT'], l['LL LAT'], l['LR LAT']);
  const w = Math.min(l['UL LON'], l['UR LON'], l['LL LON'], l['LR LON']);
  const e = Math.max(l['UL LON'], l['UR LON'], l['LL LON'], l['LL LON']);

  // Check for odd edge case
  if (l['PATH'] === 0 || l['ROW'] === 0) {
    return;
  }

  const runQuery = function (done) {
    // File placeholder object
    let final = {};

    console.log(`path: ${l['PATH']}, row: ${l['ROW']}, bbox: ${[w, s, e, n]}`);
    tileReduce({
      bbox: [w, s, e, n],
      zoom: 12,
      map: path.join(__dirname, map),
      sources: [
        {
          name: 'osm',
          mbtiles: path.join(__dirname, source),
          layers: ['osm']
        }
      ]
    })
    .on('reduce', function (features) {
      for (const k in features) {
        final[k] = features[k].concat(final[k]);
      }
    })
    .on('end', (error) => {
      if (error) {
        console.error(error);
      }

      // Make output unique and remove undefined from method above
      for (const k in final) {
        final[k] = _.uniqWith(final[k], _.isEqual);
        _.remove(final[k], (name) => { return !name; });
      }

      return done(null, {path: l['PATH'], row: l['ROW'], results: final});
    })
    .on('error', (error) => {
      console.error(error);
    });
  };

  tasks.push(runQuery);
});

parser.on('finish', () => {
  async.parallelLimit(tasks, parallelLimit, (err, results) => {
    if (err) {
      return console.error(err);
    }

    // Group everything by path
    results = _.groupBy(results, 'path');

    // Loop over each path, writing to S3
    for (let p in results) {
      let path = {};
      results[p].forEach((r) => {
        path[zp(r.row, 3)] = r.results;
      });

      fs.writeFileSync(`${zp(p, 3)}.json`, JSON.stringify(path));
    }
  });
});

const zp = function (n, c) {
  var s = String(n);
  if (s.length < c) {
    return zp('0' + n, c);
  } else {
    return s;
  }
};
