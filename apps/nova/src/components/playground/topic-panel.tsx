import { FileUploader } from './file-uploader';
import { Input } from '@tutur3u/ui/input';
import { Label } from '@tutur3u/ui/label';
import { Textarea } from '@tutur3u/ui/textarea';
import { useState } from 'react';

interface TopicPanelProps {
  topic: string;
  setTopic: (topic: string) => void;
  exampleInput: string;
  setExampleInput: (input: string) => void;
  expectedOutput: string;
  setExpectedOutput: (output: string) => void;
  inputType: string;
  setInputType: (type: string) => void;
}

export function TopicPanel({
  topic,
  setTopic,
  exampleInput,
  setExampleInput,
  expectedOutput,
  setExpectedOutput,
  inputType,
  setInputType,
}: TopicPanelProps) {
  const [file, setFile] = useState<File | null>(null);

  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    setExampleInput(uploadedFile.name);
  };

  return (
    <div className="mb-4 space-y-4">
      <div>
        <Label htmlFor="topic">Topic</Label>
        <Input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter the topic for your prompt"
        />
      </div>
      <div>
        <Label htmlFor="input-type">Input Type</Label>
        <select
          id="input-type"
          value={inputType}
          onChange={(e) => setInputType(e.target.value)}
          className="w-full rounded border p-2"
        >
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="pdf">PDF</option>
          <option value="word">Word Document</option>
          <option value="excel">Excel Document</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
      </div>
      <div>
        <Label htmlFor="example-input">Example Input</Label>
        {inputType === 'text' ? (
          <Textarea
            id="example-input"
            value={exampleInput}
            onChange={(e) => setExampleInput(e.target.value)}
            placeholder="Enter an example input"
            rows={3}
          />
        ) : (
          <FileUploader
            onFileUpload={handleFileUpload}
            acceptedTypes={inputType}
          />
        )}
        {file && (
          <p className="mt-2 text-sm text-gray-500">Uploaded: {file.name}</p>
        )}
      </div>
      <div>
        <Label htmlFor="expected-output">Expected Output</Label>
        <Textarea
          id="expected-output"
          value={expectedOutput}
          onChange={(e) => setExpectedOutput(e.target.value)}
          placeholder="Enter the expected output"
          rows={3}
        />
      </div>
    </div>
  );
}
