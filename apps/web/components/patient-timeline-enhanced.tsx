"use client";

import { motion } from "framer-motion";
import {
  FileText,
  Stethoscope,
  Pill,
  FlaskConical,
  Activity,
  Calendar,
  AlertCircle,
} from "lucide-react";
import type { TimelineEventResponse, TimelineEventType } from "@clinical-copilot/shared-types";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, staggerItem } from "@/lib/animations";

const EVENT_ICONS: Record<TimelineEventType, any> = {
  consultation: Stethoscope,
  diagnosis: Activity,
  medication: Pill,
  lab_report: FlaskConical,
  document: FileText,
  procedure: Activity,
  follow_up: Calendar,
  allergy: AlertCircle,
  condition: Activity,
};

const EVENT_COLORS: Record<TimelineEventType, string> = {
  consultation: "bg-blue-500/10 text-blue-600 border-blue-200",
  diagnosis: "bg-purple-500/10 text-purple-600 border-purple-200",
  medication: "bg-green-500/10 text-green-600 border-green-200",
  lab_report: "bg-orange-500/10 text-orange-600 border-orange-200",
  document: "bg-gray-500/10 text-gray-600 border-gray-200",
  procedure: "bg-red-500/10 text-red-600 border-red-200",
  follow_up: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  allergy: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  condition: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
};

type PatientTimelineProps = {
  events: TimelineEventResponse[];
  isLoading?: boolean;
};

export function PatientTimelineEnhanced({ events, isLoading }: PatientTimelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="bg-muted/30">
        <CardTitle>Patient timeline</CardTitle>
        <CardDescription>
          Chronological history of clinically significant events.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {events.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <div className="rounded-full bg-muted p-4 mb-4">
              <Calendar className="size-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No timeline events yet
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="relative space-y-6"
          >
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

            {events.map((event) => {
              const Icon = EVENT_ICONS[event.event_type] || Activity;
              const colorClass = EVENT_COLORS[event.event_type] || EVENT_COLORS.condition;

              return (
                <motion.div
                  key={event.id}
                  variants={staggerItem}
                  className="relative flex gap-4"
                >
                  {/* Icon */}
                  <div
                    className={`relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 ${colorClass}`}
                  >
                    <Icon className="size-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <div className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">{event.title}</h4>
                            <Badge variant="outline" className="text-xs">
                              {event.event_type.replace("_", " ")}
                            </Badge>
                          </div>
                          {event.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {event.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.event_date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
