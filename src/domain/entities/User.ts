import crypto from 'crypto';

export interface UserProps {
  id?: string;
  email: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface for JSON representation with required fields
export interface UserJSON {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private readonly _id: string;
  private readonly _email: string;
  private readonly _name: string;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  constructor(props: UserProps) {
    this._id = props.id || crypto.randomUUID();
    this._email = props.email;
    this._name = props.name;
    this._createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
  }

  get id(): string {
    return this._id;
  }

  get email(): string {
    return this._email;
  }

  get name(): string {
    return this._name;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON(): UserJSON {
    return {
      id: this._id,
      email: this._email,
      name: this._name,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  static fromUpdate(existingUser: User, updates: Partial<UserProps>): User {
    const existingData = existingUser.toJSON();
    return new User({
      ...existingData,
      ...updates,
      updatedAt: new Date(), // Always update the timestamp
    });
  }
}
