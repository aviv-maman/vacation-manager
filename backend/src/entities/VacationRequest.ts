import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Exclusion,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User";

export type VacationStatus = "Pending" | "Approved" | "Rejected";

@Entity("vacation_requests")
@Check("vacation_requests_status_check", `"status" IN ('Pending', 'Approved', 'Rejected')`)
@Check("vacation_requests_dates_check", `"end_date" > "start_date"`)
@Check(
  "vacation_requests_rejection_comment_check",
  `"status" <> 'Rejected' OR ("comments" IS NOT NULL AND length(btrim("comments")) > 0)`,
)
@Exclusion(
  "vacation_requests_no_overlap",
  `USING gist ("user_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("status" IN ('Pending', 'Approved'))`,
)
// The migration creates these indexes with descending timestamp/ID ordering.
@Index("vacation_requests_status_created_id_idx", { synchronize: false })
@Index("vacation_requests_user_created_id_idx", { synchronize: false })
export class VacationRequest {
  @PrimaryGeneratedColumn("identity", { type: "integer", generatedIdentity: "BY DEFAULT" })
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id", foreignKeyConstraintName: "vacation_requests_user_id_fkey" })
  user!: Relation<User>;

  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  @Column({ name: "end_date", type: "date" })
  endDate!: string;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @Column({ type: "text", default: "Pending" })
  status!: VacationStatus;

  @Column({ type: "text", nullable: true })
  comments!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
