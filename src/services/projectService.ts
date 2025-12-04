import Project, { IProject } from '../models/Project';
import { Types } from 'mongoose';

export interface IProjectService {
  createProject(name: string, websiteUrl: string, userId: string): Promise<IProject>;
  getProjectsByUser(userId: string): Promise<IProject[]>;
  getProjectById(projectId: string, userId: string): Promise<IProject | null>;
  updateProject(projectId: string, userId: string, updates: Partial<IProject>): Promise<IProject | null>;
  deleteProject(projectId: string, userId: string): Promise<boolean>;
}

class ProjectService implements IProjectService {
  public async createProject(name: string, websiteUrl: string, userId: string): Promise<IProject> {
    const project = await Project.create({
      name,
      websiteUrl,
      userId,
    });

    return project;
  }

  public async getProjectsByUser(userId: string): Promise<IProject[]> {
    return await Project.find({ userId: new Types.ObjectId(userId) });
  }

  public async getProjectById(projectId: string, userId: string): Promise<IProject | null> {
    return await Project.findOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
    });
  }

  public async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<IProject>
  ): Promise<IProject | null> {
    const project = await Project.findOneAndUpdate(
      {
        _id: new Types.ObjectId(projectId),
        userId: new Types.ObjectId(userId),
      },
      updates,
      { new: true, runValidators: true }
    );

    return project;
  }

  public async deleteProject(projectId: string, userId: string): Promise<boolean> {
    const result = await Project.deleteOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
    });

    return result.deletedCount > 0;
  }
}

export default new ProjectService();