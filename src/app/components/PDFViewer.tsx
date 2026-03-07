interface PDFViewerProps {
  url: string | null;
}

export default function PDFViewer({ url }: PDFViewerProps) {
  if (!url) return null;

  return (
    <div className="space-y-4">
      <div className="border p-2 rounded-lg bg-gray-50 shadow-inner w-full h-[500px] md:h-[800px]">
        <iframe 
          src={url} 
          width="100%" 
          height="100%" 
          className="rounded border border-gray-300"
          title="PDF Viewer" 
        />
      </div>
    </div>
  );
}