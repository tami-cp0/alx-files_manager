import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    this.host = process.env.DB_HOST || 'localhost';
    this.port = process.env.DB_PORT || 27017;
    this.database = process.env.DB_DATABASE || 'files_manager';
    this.dburi = `mongodb://${this.host}:${this.port}/${this.database}`;

    this.client = new MongoClient(this.dburi, { useNewUrlParser: true, useUnifiedTopology: true });
    this.db = false;
    this.initialize();
  }

  async initialize() {
    try {
      await this.client.connect();
      this.db = true;
      this.users = this.client.db().collection('users');
      this.files = this.client.db().collection('files');
    } catch (err) {
      this.db = false;
      console.log(err);
    }
  }

  isAlive() {
    return Boolean(this.db);
  }

  async nbUsers() {
    if (!this.isAlive()) {
      return new Error('Database is not connected');
    }
    const number = await this.users.countDocuments();
    return number;
  }

  async nbFiles() {
    if (!this.isAlive()) {
      return new Error('Database is not connected');
    }
    const number = await this.files.countDocuments();
    return number;
  }
}

const dbClient = new DBClient();

export default dbClient;
