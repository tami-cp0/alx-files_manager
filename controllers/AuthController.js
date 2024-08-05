import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    // extract the email and password from the header
    const authHeader = req.get('Authorization').split(' ');
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const authString = authHeader.pop();
    const credential = Buffer.from(authString, 'base64').toString('utf-8');

    // find the first occurence of :
    const index = credential.indexOf(':');
    if (index === -1) {
      return res.status(400).json({ error: 'Malformed Authorization header' });
    }

    const email = credential.slice(0, index);
    const sha1Password = sha1(credential.slice(index + 1));

    try {
      const user = await dbClient.users.findOne({ email, password: sha1Password });
      console.log(user);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } catch (err) {
      console.log(err);
    }

    const token = uuidv4();
    const authToken = `auth_${token}`;
    const duration = 24 * 3600;

    // Get the user id
    const id = (await dbClient.users.findOne({ email }))._id;

    await redisClient.set(authToken, id.toString(), duration);
    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    // Retrieve token from request headers
    const token = req.get('X-Token');

    // Get user ID from Redis using token
    const id = new ObjectId(await redisClient.get(`auth_${token}`));
    if (!id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ensure id is linked to a real user
    const user = await dbClient.users.findOne({ _id: id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await redisClient.del(`auth_${token}`);
    return res.status(204).send();
  }
}

export default AuthController;
