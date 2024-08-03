import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.isConnected = false; // Initialize this.isConnected

    this.client.on('error', (error) => {
      console.log(`Redis client not connected to the server: ${error.message}`);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.isConnected = true;
    });
  }

  isAlive() {
    return Boolean(this.isConnected);
  }

  async get(key) {
    try {
      const value = await this.getAsync(key);
      return value;
    } catch (error) {
      console.error(`Error getting key ${key}: ${error.message}`);
      throw error;
    }
  }

  async set(key, value, duration) {
    try {
      await promisify(this.client.setex).bind(this.client)(key, duration, value);
    } catch (error) {
      console.error(`Error setting key ${key}: ${error.message}`);
      throw error;
    }
  }

  async del(key) {
    try {
      await promisify(this.client.del).bind(this.client)(key);
    } catch (error) {
      console.error(`Error deleting key ${key}: ${error.message}`);
      throw error;
    }
  }
}

const redisClient = new RedisClient();

export default redisClient;
