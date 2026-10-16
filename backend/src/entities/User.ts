import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

export type UserRole = "Requester" | "Validator";

@Entity("users")
@Unique("users_email_key", ["email"])
@Check("users_role_check", `"role" IN ('Requester', 'Validator')`)
export class User {
  @PrimaryGeneratedColumn("identity", { type: "integer", generatedIdentity: "BY DEFAULT" })
  id!: number;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text" })
  email!: string;

  @Column({ type: "text", select: false })
  password!: string;

  @Column({ type: "text" })
  role!: UserRole;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
