import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { ENV } from '../config/env';

export interface IAuthService {
  registerUser(email: string, password: string, name: string, role?: 'admin' | 'hotel_manager'): Promise<{ user: IUser; token: string }>;
  loginUser(email: string, password: string): Promise<{ user: IUser; token: string }>;
  generateToken(userId: string): string;
}

class AuthService implements IAuthService {
  public async registerUser(
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'hotel_manager' = 'hotel_manager'
  ): Promise<{ user: IUser; token: string }> {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
      role,
    });

    // Generate token
    const token = this.generateToken(user._id.toString());

    return { user, token };
  }

  public async loginUser(email: string, password: string): Promise<{ user: IUser; token: string }> {
    // Check if user exists
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if password is correct
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    // Generate token
    const token = this.generateToken(user._id.toString());

    return { user, token };
  }

  public generateToken(userId: string): string {
    return jwt.sign({ id: userId }, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRES_IN,
    } as any);
  }
}

export default new AuthService();