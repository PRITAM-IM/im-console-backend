import { Request, Response } from 'express';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';

export const createProject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.user._id.toString();
  const { name, websiteUrl } = req.body;

  try {
    const project = await projectService.createProject(name, websiteUrl, userId);

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getProjects = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.user._id.toString();

  try {
    const projects = await projectService.getProjectsByUser(userId);

    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getProject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.user._id.toString();
  const { id: projectId } = req.params;

  try {
    const project = await projectService.getProjectById(projectId, userId);

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const updateProject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.user._id.toString();
  const { id: projectId } = req.params;
  const updates = req.body;

  try {
    const project = await projectService.updateProject(projectId, userId, updates);

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const deleteProject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.user._id.toString();
  const { id: projectId } = req.params;

  try {
    const deleted = await projectService.deleteProject(projectId, userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});