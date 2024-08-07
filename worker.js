import Queue from 'bull/lib/queue';
import imageThumbnail from 'image-thumbnail';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;
  if (!fileId) { throw new Error('Missing fileId'); }
  if (!userId) { throw new Error('Missing userId'); }

  const file = await dbClient.files.findOne({ _id: new ObjectId(fileId), userId });
  if (!file) { throw new Error('File not found'); }

  const sizes = [500, 250, 100];

  const tasks = sizes.map(async (size) => {
    const newFilePath = `${file.localPath}_${size}`;
    try {
      const thumbnail = await imageThumbnail(file.localPath, { width: size });
      fs.writeFile(newFilePath, thumbnail, (err) => {
        if (err) {
          console.error(`Error writing file ${newFilePath}:`, err);
        } else {
          console.log(`File written successfully: ${newFilePath}`);
        }
      });
    } catch (err) {
      console.log(`Error processing size ${size}:`, err);
    }
  });

  await Promise.all(tasks);
});
