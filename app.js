// Import Libraries
import DotEnv from 'dotenv';
import NodeSheets from 'node-sheets';
import Hapi from 'hapi';
import Async from 'async';
import Vision from 'azure-cognitiveservices-vision';
import { CognitiveServicesCredentials } from 'ms-rest-azure';
import Fs from 'fs';
import Request from 'request';
import AlgoliaSearch from 'algoliasearch';

// Load the ENV
DotEnv.load({
  silent: true
});

// Hapi
const server = Hapi.server({
  port: 4040,
  host: 'localhost'
});

// Setup Algolia
const client = AlgoliaSearch(
  process.env.ALGOLIA_ID,
  process.env.ALGOLIA_SECRET
);
const AlgoliaIndex = client.initIndex(process.env.ALGOLIA_INDEX);

// Setup the MS Services
let credentials = new CognitiveServicesCredentials(process.env.MS_SERVICE_KEY);
let computerVisionApiClient = new Vision.ComputerVisionAPIClient(
  credentials,
  'westcentralus'
);
let cvModels = computerVisionApiClient.models;

// Load the Google Sheet
const GoogleSheets = new NodeSheets(process.env.GOOGLE_SHEET_ID);
GoogleSheets.authorizeApiKey(process.env.GOOGLE_API_KEY)
  .then(() => {
    console.log('Grab Data');
    return GoogleSheets.tables('Sheet1');
  })
  // Simplify the return from Google Sheets
  .then(data => {
    console.log('Simplify Data');
    return data.rows.map(image => {
      let newImageObject = {};
      for (let key in image) {
        if (image[key]) {
          newImageObject[key] = image[key].stringValue;
        }
      }
      newImageObject.objectID = newImageObject.objectID;
      return newImageObject;
    });
  })
  // Grab meta data from MS cognitive
  .then(data => {
    console.log('Grab MS Tags');
    let processedRecords = [];
    return new Promise((resolve, reject) => {
      Async.each(
        data,
        (record, cb) => {
          let result = computerVisionApiClient
            .analyzeImage(record.ImageLowRes, {
              visualFeatures: [
                'Categories',
                'Tags',
                'Description',
                'Color',
                'Faces',
                'ImageType'
              ]
            })
            .then(data => {
              record.categories = data.categories.map(category => {
                return category.name;
              });
              record.tags = data.tags.map(tag => {
                return tag.name;
              });
              record.color = data.color;
              record.ms_description = data.description;
              processedRecords.push(record);
              setTimeout(() => {
                cb();
              }, 60000);
            })
            .catch(error => {
              // console.log(error);
              setTimeout(() => {
                cb(error);
              }, 60000);
            });
        },
        (error, response) => {
          if (error) {
            console.log(error);
          }
          resolve(processedRecords);
        }
      );
    });
  })
  // Push to Algolia
  .then(data => {
    console.log('Dump in Algolia');
    return new Promise((resolve, reject) => {
      Async.eachSeries(
        data,
        record => {
          AlgoliaIndex.addObject(record, (err, content) => {
            if (err) {
              console.log('Error: %s', err);
            } else {
              console.log('Algolia Added');
            }
          });
        },
        () => {
          resolve(data);
        }
      );
    });
  })
  // Hacky server!
  .then(data => {
    const init = async () => {
      server.route({
        method: 'GET',
        path: '/object',
        handler: (request, h) => {
          return data;
        }
      });
      server.route({
        method: 'GET',
        path: '/object/{id}',
        handler: (request, h) => {
          return [
            data
              .filter(item => {
                return item.ObjectNumber === request.params.id;
              })
              .reduce((prevVal, elem) => {
                let newObject = prevVal.ObjectNumber ? prevVal : elem;
                if (elem.PrimaryOrSecondaryImage == 'Primary') {
                  newObject.PrimaryHighRes = elem.ImageHighRes;
                  newObject.PrimaryLowRes = elem.ImageLowRes;
                } else {
                  if (!newObject.HighRes) {
                    newObject.HighRes = [];
                  }
                  if (!newObject.HighRes.includes(elem.ImageHighRes)) {
                    newObject.HighRes.push(elem.ImageHighRes);
                    delete newObject.ImageHighRes;
                  }
                  if (!newObject.LowRes) {
                    newObject.LowRes = [];
                  }
                  if (!newObject.LowRes.includes(elem.ImageLowRes)) {
                    newObject.LowRes.push(elem.ImageLowRes);
                    delete newObject.ImageLowRes;
                  }
                }
                newObject.tags.concat(elem.tags);
                newObject.categories.concat(elem.categories);
                delete newObject.ImageID;
                return newObject;
              }, {})
          ];
        }
      });
      server.route({
        method: 'GET',
        path: '/image/{id}',
        handler: (request, h) => {
          return data.filter(item => {
            return item.ImageID === request.params.id;
          });
        }
      });
      await server.start();
      console.log(`Server running at: ${server.info.uri}`);
    };
    init();
  })
  .catch(console.error);
