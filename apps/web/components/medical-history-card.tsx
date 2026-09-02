"use client";

import { motion } from "framer-motion";
import { Plus, Trash2, AlertCircle, Pill } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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

type MedicalItem = {
  id: string;
  name: string;
  status?: string;
  dosage?: string;
  reaction?: string;
  severity?: string;
  notes?: string;
  onset_date?: string;
  start_date?: string;
};

type MedicalHistoryCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  items: MedicalItem[];
  isLoading?: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  emptyMessage: string;
  statusColors?: Record<string, string>;
};

const STATUS_COLORS: Record<string, string> = {
  active: "default",
  resolved: "secondary",
  chronic: "destructive",
  discontinued: "secondary",
  mild: "secondary",
  moderate: "default",
  severe: "destructive",
};

export function MedicalHistoryCard({
  title,
  description,
  icon: Icon,
  items,
  isLoading,
  onAdd,
  onRemove,
  emptyMessage,
}: MedicalHistoryCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-muted-foreground" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Icon className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Button onClick={onAdd} size="sm" variant="outline">
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <div className="rounded-full bg-muted p-4 mb-4">
              <Icon className="size-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {items.map((item) => (
              <motion.div
                key={item.id}
                variants={staggerItem}
                layout
                className="group relative rounded-lg border bg-card p-4 transition-all hover:shadow-sm hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{item.name}</h4>
                      {item.status && (
                        <Badge variant={STATUS_COLORS[item.status] as "default" | "secondary" | "destructive" | "outline"}>
                          {item.status}
                        </Badge>
                      )}
                      {item.severity && (
                        <Badge variant={STATUS_COLORS[item.severity] as "default" | "secondary" | "destructive" | "outline"}>
                          {item.severity}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {item.dosage && (
                        <span className="flex items-center gap-1">
                          <Pill className="size-3" />
                          {item.dosage}
                        </span>
                      )}
                      {item.reaction && (
                        <span className="flex items-center gap-1">
                          <AlertCircle className="size-3" />
                          {item.reaction}
                        </span>
                      )}
                      {(item.onset_date || item.start_date) && (
                        <span>
                          Since {new Date(item.onset_date || item.start_date!).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
