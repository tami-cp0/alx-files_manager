import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.get('X-Token');
    const id = new ObjectId(await redisClient.get(`auth_${token}`));
    if (!id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await dbClient.users.findOne({ _id: id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      type,
      data,
    } = req.body;

    // list of accepted types
    const acceptedType = ['folder', 'file', 'image'];

    // The two optional values
    let { parentId, isPublic } = req.body;

    if (!parentId) { parentId = 0; }
    if (!isPublic) { isPublic = false; }

    if (!name) { return res.status(400).send({ error: 'Missing name' }); }
    if (!type || !acceptedType.includes(type)) { return res.status(400).send({ error: 'Missing type' }); }
    if (!data && type !== 'folder') { return res.status(400).send({ error: 'Missing data' }); }

    if (parentId) {
      const _id = new ObjectId(parentId);
      const result = await dbClient.files.findOne({ _id });

      if (!result) { return res.status(400).send({ error: 'Parent not found' }); }
      if (type !== 'folder') {
        return res.status(400).send({ error: 'Parent is not a folder' });
      }
    }

    let document = { status: 'default' };

    if (type === 'folder') {
      try {
        const result = await dbClient.files.insertOne({
          userId: user._id.toString(),
          name,
          type,
          isPublic,
          parentId,
        });

        document = {
          id: result.insertedId,
          userId: user._id.toString(),
          name,
          type,
          isPublic,
          parentId,
        };
      } catch (err) {
        throw new Error(err);
      }
    } else {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

      try {
        fs.accessSync(folderPath, fs.constants.F_OK); // Check if folder exists
      } catch (err) {
        // Folder doesn't exist, create it
        try {
          fs.mkdirSync(folderPath, { recursive: true });
        } catch (mkdirErr) {
          throw new Error(mkdirErr);
        }
      }

      const filePath = path.join(folderPath, uuidv4());
      const fileData = Buffer.from(data, 'base64');

      try {
        fs.writeFileSync(filePath, fileData); // Write the file
      } catch (writeErr) {
        throw new Error(writeErr);
      }

      try {
        const result = await dbClient.files.insertOne({
          userId: user._id.toString(),
          name,
          type,
          isPublic,
          parentId,
          localPath: filePath,
        });

        document = {
          id: result.insertedId,
          userId: user._id.toString(),
          name,
          type,
          isPublic,
          parentId,
        };
      } catch (err) {
        throw new Error(err);
      }
    }

    return res.status(201).json(document);
  }

  static async getShow(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = new ObjectId(await redisClient.get(`auth_${token}`));
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    const user = await dbClient.users.findOne({ _id: userId });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let fileId;

    try {
      fileId = new ObjectId(req.params.id);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await dbClient.files.findOne({ _id: fileId, userId });
    if (!result) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json(result);
  }

  static async getIndex(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = new ObjectId(await redisClient.get(`auth_${token}`));
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    const user = await dbClient.users.findOne({ _id: userId });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { parentId, page } = req.query;

    const file = await dbClient.files.findOne({ parentId });
    if (!file) {
      return res.status(200).json([]);
    }
  }
}

export default FilesController;
