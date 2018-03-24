// Import Libraries
import DotEnv from 'dotenv';
import NodeSheets from 'node-sheets';
import Hapi from 'hapi';

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
          return data.filter(item => {
            return item.ObjectNumber === request.params.id;
          });
        }
      });
      await server.start();
      console.log(`Server running at: ${server.info.uri}`);
    };
    init();
  })
  .catch(console.error);
