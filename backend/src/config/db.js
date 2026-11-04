const mongoose = require('mongoose');
const { mongodbUri } = require('./env');

// Defence in depth against NoSQL operator injection: any nested object with a
// "$operator" key inside a query filter is neutralised unless explicitly trusted.
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

async function connectDb() {
  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 8000 });
  // Make sure unique indexes (e.g. user email) exist before we accept traffic.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  console.log('MongoDB connection established.'); // never log the URI: it may contain credentials
}

async function disconnectDb() {
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb };
