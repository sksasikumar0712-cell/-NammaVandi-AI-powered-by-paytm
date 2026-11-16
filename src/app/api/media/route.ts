import { localRequest } from "@/lib/service";
import { transcribe, extractImage } from "@/lib/adapters";
export async function POST(req: Request) {
  try {
    localRequest(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
      throw Error("Choose a file under 10 MB");
    if (!/^(audio|image)\//.test(file.type))
      throw Error("Choose an audio recording or image");
    return Response.json(
      await (file.type.startsWith("audio/")
        ? transcribe(file)
        : extractImage(file)),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
