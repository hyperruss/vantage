ALTER TABLE reservations
    ADD COLUMN paid_at timestamptz,
    ADD CONSTRAINT reservations_payment_after_finish
        CHECK (paid_at IS NULL OR (status = 'completed' AND paid_at >= finished_at));
