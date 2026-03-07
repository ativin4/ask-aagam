import { NextResponse } from "next/server";
import * as admin from "firebase-admin";

// Prevent re-initialization in development
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.NEXT_FILE_UPLOAD_CLIENT_EMAIL,
      privateKey: process.env.NEXT_FILE_UPLOAD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];

    // 1. Cryptographically verify the caller's token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // 2. Security Check: Ensure the caller is actually a maintainer
    if (decodedToken.maintainer!== true) {
      return NextResponse.json({ error: "Forbidden: Maintainer role required" }, { status: 403 });
    }

    // 3. Extract the target email from the request body
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Target email is required" }, { status: 400 });
    }

    // 4. Find the user by email and assign the claim
    const targetUser = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(targetUser.uid, { maintainer: true });

    return NextResponse.json({ message: `Successfully made ${email} a maintainer.` });

  } catch (error: unknown) {
    console.error("Error making maintainer:", error);
    return NextResponse.json({ error: (error as Error).message || "Internal Server Error" }, { status: 500 });
  }
}