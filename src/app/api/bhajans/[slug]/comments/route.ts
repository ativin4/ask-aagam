import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "../../../../../../lib/firebaseAdmin";

export const dynamic = "force-dynamic";

interface CommentInput {
  text: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const snapshot = await adminDb
    .collection("bhajans")
    .doc(decodeURIComponent(slug))
    .collection("comments")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const comments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      text: data.text,
      userName: data.userName,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    };
  });

  return NextResponse.json({ comments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const body = (await request.json()) as CommentInput;
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Comment text required" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Comment too long" }, { status: 400 });
  }

  const bhajanRef = adminDb.collection("bhajans").doc(decodeURIComponent(slug));
  if (!(await bhajanRef.get()).exists) {
    return NextResponse.json({ error: "Bhajan not found" }, { status: 404 });
  }

  const commentRef = await bhajanRef.collection("comments").add({
    text,
    userId: decodedToken.uid,
    userName: decodedToken.name || decodedToken.email || "Anonymous",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: commentRef.id }, { status: 201 });
}
