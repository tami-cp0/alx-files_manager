import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';

const router = Router();

// Returns the status of the redis and mongodb server
router.get('/status', AppController.getStatus);

// Returns the number of users and files
router.get('/stats', AppController.getStats);

// Get all users
router.post('/users', UsersController.postNew);

// Gets the current user
router.get('/users/me', UsersController.getMe);

// connect the user to the server
router.get('/connect', AuthController.getConnect);

// disconnect the user from the server
router.get('/disconnect', AuthController.getDisconnect);

export default router;
