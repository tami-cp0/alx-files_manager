import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
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
        console.log(err);
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
          console.log(mkdirErr);
        }
      }

      const filePath = path.join(folderPath, uuidv4());
      const fileData = Buffer.from(data, 'base64');

      try {
        fs.writeFileSync(filePath, fileData); // Write the file
      } catch (writeErr) {
        console.log(writeErr);
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
        console.log(err);
      }
    }

    return res.status(201).json(document);
  }

  static async getShow(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    const _id = new ObjectId(userId);
    const user = await dbClient.users.findOne({ _id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let fileId;

    try {
      fileId = new ObjectId(req.params.id);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    let result = await dbClient.files.findOne(
      { _id: fileId, userId },
      { projection: { localPath: 0 } },
    );
    if (!result) {
      return res.status(404).json({ error: 'Not found' });
    }

    result = {
      id: result._id,
      ...result,
    };
    delete result._id;

    return res.status(200).json(result);
  }

  static async getIndex(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    const _id = new ObjectId(userId);
    const user = await dbClient.users.findOne({ _id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page, 10) || 0;

    const files = await dbClient.files.find({ parentId });
    if (!files) {
      return res.status(200).json([]);
    }

    const pageSize = 20;
    const skip = page * pageSize;
    const limit = pageSize;

    const pipeline = [
      { $skip: skip },
      { $limit: limit },
      { $project: { localPath: 0 } },
    ];

    let results = await dbClient.files.aggregate(pipeline).toArray();
    results = results.map((document) => {
      const { _id, ...rest } = document;
      return {
        id: _id,
        ...rest,
      };
    });

    return res.status(200).json(results);
  }

  static async putPublish(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    let _id = new ObjectId(userId);
    const user = await dbClient.users.findOne({ _id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // set _id to the id in params which is the file id
    try {
      _id = new ObjectId(req.params.id);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.files.findOne({ _id, userId });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filter = { isPublic: false };
    const update = { $set: { isPublic: true } };
    await dbClient.files.updateOne(filter, update);

    let document = await dbClient.files.findOne(
      { _id, userId },
      { projection: { localPath: 0 } },
    );

    document = {
      id: document._id,
      ...document,
    };
    delete document._id;

    return res.status(200).json(document);
  }

  static async putUnpublish(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    let _id = new ObjectId(userId);
    const user = await dbClient.users.findOne({ _id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // set _id to the id in params which is the file id
    try {
      _id = new ObjectId(req.params.id);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.files.findOne({ _id, userId });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filter = { isPublic: true };
    const update = { $set: { isPublic: false } };
    await dbClient.files.updateOne(filter, update);

    let document = await dbClient.files.findOne(
      { _id, userId },
      { projection: { localPath: 0 } },
    );

    document = {
      id: document._id,
      ...document,
    };
    delete document._id;

    return res.status(200).json(document);
  }

  static async getFile(req, res) {
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const userId = await redisClient.get(`auth_${token}`);

    // get the user attached to the id
    let _id = new ObjectId(userId);
    const user = await dbClient.users.findOne({ _id });

    // set _id to the id in params which is the file id
    try {
      _id = new ObjectId(req.params.id);
    } catch (err) {
      return res.status(404).json({ error: 'Not founda' });
    }

    const file = await dbClient.files.findOne({ _id, userId });

    if (!file.isPublic && (!user || !userId)) {
      return res.status(404).json({ error: 'Not foundb' });
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: 'A folder doesn\'t have content' });
    }

    // If the file is not locally present, return an error
    try {
      fs.accessSync(file.localPath, fs.constants.F_OK); // Check if file exists
    } catch (err) {
      return res.status(404).json({ error: 'Not foundc' });
    }

    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);

    let content;
    try {
      content = fs.readFileSync(file.localPath, 'utf8');
    } catch (err) {
      console.log(err);
    }

    return res.status(200).send(content);
  }
}

export default FilesController;
