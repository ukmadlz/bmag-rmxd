// Import Libraries
import DotEnv from 'dotenv';
import NodeSheets from 'node-sheets';
import Hapi from 'hapi';
import Async from 'async';

// Load the ENV
DotEnv.load({
  silent: true
});

// Hapi
const server = Hapi.server({
  port: 4040,
  host: 'localhost'
});

// Load the Google Sheet
const GoogleSheets = new NodeSheets(process.env.GOOGLE_SHEET_ID);
GoogleSheets.authorizeApiKey(process.env.GOOGLE_API_KEY)
  .then(() => GoogleSheets.tables('Sheet1'))
  .then(data => {
    return data.rows.map(image => {
      let newImageObject = {};
      for (let key in image) {
        if (image[key]) {
          newImageObject[key] = image[key].stringValue;
        }
      }
      return newImageObject;
    });
  })
  .then(data => {
    const init = async () => {
      server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
          return data;
        }
      });
      server.route({
        method: 'GET',
        path: '/object/{id}',
        handler: (request, h) => {
          return data
            .filter(item => {
              return item.ObjectNumber === request.params.id;
            })
            .reduce((prevVal, elem) => {
              let newObject = prevVal.ObjectNumber ? prevVal : elem;
              if (elem.PrimaryOrSecondaryImage == "Primary") {
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
              return newObject;
            }, {}
          );
        }
      });
      await server.start();
      console.log(`Server running at: ${server.info.uri}`);
    };
    init();
  })
  .catch(console.error);
