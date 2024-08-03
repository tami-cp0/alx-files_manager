import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static async getStatus(req, res) {
    try {
      if (await redisClient.isAlive() && await dbClient.isAlive()) {
        res.status(200).json({ redis: true, db: true });
      } else {
        res.status(500).send('DB or Redis is down');
      }
    } catch (error) {
      res.status(500).send({ error: 'An error occurred' });
    }
  }

  static async getStats(req, res) {
    try {
      const files = await dbClient.nbFiles();
      const users = await dbClient.nbUsers();

      res.status(200).json({ users, files });
    } catch (error) {
      res.status(500).send({ error: 'An error occurred' });
    }
  }
}

export default AppController;
