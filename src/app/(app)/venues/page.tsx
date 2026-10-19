import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ImageOff, Images, MapPin, Pencil, Plus } from "lucide-react";
import { requireViewer, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/signed-urls";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VenueDialog } from "./venue-dialog";
import { SceneDialog } from "./scene-dialog";

export const metadata: Metadata = { title: "Venues & Scenes" };

export default async function VenuesPage() {
  const viewer = await requireViewer();
  const staff = isStaff(viewer.role);
  const supabase = await createClient();

  const { data: venues } = await supabase
    .from("venues")
    .select(
      "id, name, address, notes, drive_folder_url, scenes(id, name, archived, tasks(status, success_count, target_episodes, archived), scene_photos(thumb_path, kind, created_at))",
    )
    .eq("archived", false)
    .order("name");

  // One cover per scene: first reference photo, else first photo.
  const covers = new Map<string, string>();
  for (const v of venues ?? []) {
    for (const s of v.scenes) {
      const photos = [...s.scene_photos].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const cover = photos.find((p) => p.kind === "reference") ?? photos[0];
      if (cover) covers.set(s.id, cover.thumb_path);
    }
  }
  const signed = await signPaths([...covers.values()]);
  const venueOptions = (venues ?? []).map((v) => ({ id: v.id, name: v.name }));

  return (
    <>
      <PageHeader
        title="Venues & Scenes"
        description="Every physical setup we record in, with reference photos, clearance notes and reset steps."
        actions={
          staff && (
            <>
              <VenueDialog trigger={<Button variant="outline"><Plus /> Venue</Button>} />
              {venueOptions.length > 0 && (
                <SceneDialog venues={venueOptions} trigger={<Button><Plus /> Scene</Button>} />
              )}
            </>
          )
        }
      />

      {!venues?.length && (
        <EmptyState
          icon={MapPin}
          title="No venues yet"
          description={staff ? "Create a venue, or run the spreadsheet import." : "You haven't been assigned to a venue yet."}
        />
      )}

      <div className="space-y-10">
        {venues?.map((venue) => {
          const scenes = venue.scenes
            .filter((s) => !s.archived)
            .sort((a, b) => (a.name === "Unsorted" ? 1 : b.name === "Unsorted" ? -1 : a.name.localeCompare(b.name)));
          return (
            <section key={venue.id} aria-labelledby={`venue-${venue.id}`}>
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id={`venue-${venue.id}`} className="text-lg font-semibold tracking-tight">
                  {venue.name}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {scenes.length} scene{scenes.length === 1 ? "" : "s"}
                </span>
                {venue.address && <span className="text-sm text-muted-foreground">· {venue.address}</span>}
                <div className="ml-auto flex items-center gap-1">
                  {venue.drive_folder_url && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={venue.drive_folder_url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink /> Photo folder
                      </a>
                    </Button>
                  )}
                  {staff && (
                    <VenueDialog
                      venue={venue}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${venue.name}`}>
                          <Pencil />
                        </Button>
                      }
                    />
                  )}
                </div>
              </div>

              {scenes.length === 0 ? (
                <EmptyState icon={Images} title="No scenes yet" className="py-8" />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {scenes.map((scene) => {
                    const tasks = scene.tasks.filter((t) => !t.archived);
                    const success = tasks.reduce((n, t) => n + Math.min(t.success_count, t.target_episodes), 0);
                    const target = tasks
                      .filter((t) => ["ready", "collecting", "done"].includes(t.status))
                      .reduce((n, t) => n + t.target_episodes, 0);
                    const cover = covers.get(scene.id);
                    const url = cover ? signed.get(cover) : undefined;
                    return (
                      <Link
                        key={scene.id}
                        href={`/venues/scenes/${scene.id}`}
                        className="group overflow-hidden rounded-xl border bg-card shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <div className="relative aspect-[4/3] bg-muted">
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                            <img
                              src={url}
                              alt=""
                              className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <ImageOff className="size-6" />
                            </div>
                          )}
                          <Badge variant="secondary" className="absolute top-2 right-2 bg-background/85 backdrop-blur">
                            <Images /> {scene.scene_photos.length}
                          </Badge>
                        </div>
                        <div className="space-y-2 p-3">
                          <div className="line-clamp-1 font-medium">{scene.name}</div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {tasks.length} task{tasks.length === 1 ? "" : "s"}
                            </span>
                            {target > 0 && (
                              <span className="tabular">{Math.round((success / target) * 100)}% collected</span>
                            )}
                          </div>
                          {target > 0 && (
                            <div className="h-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${(success / target) * 100}%` }} />
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
