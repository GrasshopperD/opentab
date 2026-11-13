import { redirect } from "next/navigation";

// The site root opens Demo Mode, the judge-facing technical demonstration. Product Mode lives at /home.
// A temporary (307) redirect on every domain attached to this project; no storage, keys or sessions are touched.
export default function Root() {
  redirect("/demo");
}
