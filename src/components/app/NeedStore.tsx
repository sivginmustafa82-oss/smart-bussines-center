import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./ui-bits";

export function NeedStore({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<Store />}
      title="Önce bir mağaza ekleyin"
      description={`${what} bir mağazaya bağlı olarak tutulur.`}
      action={
        <Button asChild>
          <Link to="/magazalar">Mağaza ekle</Link>
        </Button>
      }
    />
  );
}
