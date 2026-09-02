"use client";

import { motion } from "framer-motion";
import { Calendar, Mail, MapPin, Phone, Stethoscope, Trash2 } from "lucide-react";
import type { PatientResponse } from "@clinical-copilot/shared-types";

import { Button } from "@/components/ui/button";
import { PatientAvatar } from "@/components/clinical";
import { slideUp, staggerContainer, staggerItem } from "@/lib/animations";

type PatientHeaderProps = {
  patient: PatientResponse;
  onStartConsultation: () => void;
  onDelete: () => void;
  startingConsultation: boolean;
};

export function PatientHeader({
  patient,
  onStartConsultation,
  onDelete,
  startingConsultation,
}: PatientHeaderProps) {
  const age = patient.date_of_birth
    ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()
    : null;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={slideUp}
      className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-background to-muted/20 p-6 shadow-sm"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-3xl" />
      
      <div className="relative flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <PatientAvatar
              firstName={patient.first_name}
              lastName={patient.last_name}
              size="lg"
              className="ring-4 ring-background shadow-lg"
            />
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            <motion.div variants={staggerItem}>
              <h1 className="text-2xl font-bold tracking-tight">
                {patient.first_name} {patient.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {age !== null && `${age} years • `}{patient.sex}
              </p>
            </motion.div>

            <motion.div
              variants={staggerItem}
              className="flex flex-wrap gap-4 text-sm text-muted-foreground"
            >
              {patient.date_of_birth && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-4" />
                  <span>{new Date(patient.date_of_birth).toLocaleDateString()}</span>
                </div>
              )}
              {patient.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="size-4" />
                  <span>{patient.phone}</span>
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="size-4" />
                  <span>{patient.email}</span>
                </div>
              )}
              {patient.address && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  <span className="line-clamp-1">{patient.address}</span>
                </div>
              )}
            </motion.div>

            {patient.emergency_contact_name && (
              <motion.div
                variants={staggerItem}
                className="rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-muted-foreground">Emergency contact</p>
                <p className="font-medium">
                  {patient.emergency_contact_name}
                  {patient.emergency_contact_phone && (
                    <span className="ml-2 text-muted-foreground">
                      {patient.emergency_contact_phone}
                    </span>
                  )}
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-2"
        >
          <Button
            onClick={onStartConsultation}
            disabled={startingConsultation}
            size="lg"
            className="shadow-md hover:shadow-lg transition-shadow"
          >
            <Stethoscope className="size-4" />
            {startingConsultation ? "Starting…" : "Start consultation"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
