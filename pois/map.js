'use strict';

// Population threshold for cities
const popThreshold = 500000;

module.exports = (data, tile, writeData, done) => {
  let o = {
    parks: [],
    monuments: [],
    cities: [],
    states: [],
    countries: [],
    continents: []
  };

  // Loop over each feature to check it out
  data.osm.osm.features.forEach((f) => {
    // Make sure it has a name
    if (!f.properties.name) {
      return;
    }

    // National Parks
    if (f.properties.boundary === 'national_park') {
      o.parks.push({name: f.properties.name, url: f.properties.url});
    }

    // Monuments
    if (f.properties.historic === 'monument' && f.properties.url) {
      o.monuments.push({name: f.properties.name, url: f.properties.url});
    }

    // Cities
    if (f.properties.place === 'city') {
      // Make sure it's above population limit
      if (f.properties.population && f.properties.population > popThreshold) {
        o.cities.push(f.properties.name);
      }
    }

    // States
    if (f.properties.place === 'state') {
      o.states.push(f.properties.name);
    }

    // Countries
    if (f.properties.place === 'country') {
      o.countries.push(f.properties.name);
    }

    // Continents
    if (f.properties.place === 'continent') {
      o.continents.push(f.properties.name);
    }

    // Check all for state, country, continent
    if (f.properties['is_in:state']) {
      o.states.push(f.properties['is_in:state']);
    }
    if (f.properties['is_in:country']) {
      o.countries.push(f.properties['is_in:country']);
    }
    if (f.properties['is_in:continent']) {
      o.continents.push(f.properties['is_in:continent']);
    }
  });

  // Return results
  done(null, o);
};
