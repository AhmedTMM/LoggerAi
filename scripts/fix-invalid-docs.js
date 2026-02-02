// Run with: node scripts/fix-invalid-docs.js
const mongoose = require('mongoose');

async function fixInvalidDocuments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aviation-intelligence');

    console.log('Connected to MongoDB');

    // Fix invalid progressStep values
    const result1 = await mongoose.connection.db.collection('parseddocuments').updateMany(
      { progressStep: { $nin: ['pending', 'queued', 'uploading', 'analyzing', 'processing', 'extracting', 'complete', 'failed'] } },
      { $set: { progressStep: 'queued', status: 'queued' } }
    );

    console.log(`Fixed ${result1.modifiedCount} documents with invalid progressStep`);

    // Fix aircraft missing userId (set to empty string or delete them)
    const result2 = await mongoose.connection.db.collection('aircraft').deleteMany(
      { userId: { $exists: false } }
    );

    console.log(`Deleted ${result2.deletedCount} aircraft without userId`);

    await mongoose.disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixInvalidDocuments();
