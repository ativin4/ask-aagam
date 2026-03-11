import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.NEXT_FILE_UPLOAD_CLIENT_EMAIL,
      privateKey: process.env.NEXT_FILE_UPLOAD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { id } = params;

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    if (decodedToken.maintainer !== true) {
      return NextResponse.json({ error: "Forbidden: Maintainers only" }, { status: 403 });
    }

    const body = await request.json();
    const { title, writer, categories, tikakar, description } = body;

    const updateData: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (title !== undefined) updateData.title = title;
    if (writer !== undefined) updateData.writer = writer;
    if (categories !== undefined) updateData.categories = categories;
    if (tikakar !== undefined) updateData.tikakar = tikakar;
    if (description !== undefined) updateData.description = description;

    await db.collection('scriptures').doc(id).update(updateData);

    return NextResponse.json({ message: "Scripture updated successfully", id });
  } catch (error: any) {
    console.error("Error updating scripture:", error);
    if (error.code === 5) { // NOT_FOUND
        return NextResponse.json({ error: "Scripture not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
