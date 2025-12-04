import express from 'express';
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
} from '../controllers/projectController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .post(authenticate, createProject)
  .get(authenticate, getProjects);

router.route('/:id')
  .get(authenticate, getProject)
  .put(authenticate, updateProject)
  .delete(authenticate, deleteProject);

export default router;