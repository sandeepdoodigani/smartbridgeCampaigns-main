import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Quote,
  Minus,
  Palette,
  MousePointerClick,
  Space
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const COLORS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#DC2626', '#EA580C', '#D97706', '#CA8A04',
  '#16A34A', '#059669', '#0D9488', '#0891B2',
  '#2563EB', '#4F46E5', '#7C3AED', '#9333EA',
  '#C026D3', '#DB2777', '#E11D48', '#FFFFFF',
];

const BUTTON_COLORS = [
  { name: 'Blue', bg: '#2563EB', text: '#FFFFFF' },
  { name: 'Indigo', bg: '#4F46E5', text: '#FFFFFF' },
  { name: 'Green', bg: '#16A34A', text: '#FFFFFF' },
  { name: 'Red', bg: '#DC2626', text: '#FFFFFF' },
  { name: 'Orange', bg: '#EA580C', text: '#FFFFFF' },
  { name: 'Purple', bg: '#7C3AED', text: '#FFFFFF' },
  { name: 'Pink', bg: '#DB2777', text: '#FFFFFF' },
  { name: 'Teal', bg: '#0D9488', text: '#FFFFFF' },
  { name: 'Dark', bg: '#1F2937', text: '#FFFFFF' },
  { name: 'Light', bg: '#F3F4F6', text: '#1F2937' },
];

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [buttonOpen, setButtonOpen] = useState(false);
  const [buttonText, setButtonText] = useState('Click Here');
  const [buttonUrl, setButtonUrl] = useState('');
  const [buttonColor, setButtonColor] = useState(BUTTON_COLORS[1]);
  const [buttonSize, setButtonSize] = useState<'small' | 'medium' | 'large'>('medium');
  const lastContentRef = useRef<string>(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
      Underline,
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: placeholder || 'Start writing your email content...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== lastContentRef.current) {
      lastContentRef.current = content;
      if (content && content.trim() !== '') {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setLinkUrl('');
    setLinkOpen(false);
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imageUrl) return;
    
    editor.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl('');
    setImageOpen(false);
  }, [editor, imageUrl]);

  const insertButton = useCallback(() => {
    if (!editor || !buttonUrl || !buttonText) return;
    
    const padding = buttonSize === 'small' ? '8px 16px' : buttonSize === 'large' ? '16px 32px' : '12px 24px';
    const fontSize = buttonSize === 'small' ? '14px' : buttonSize === 'large' ? '18px' : '16px';
    
    const buttonHtml = `
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0;">
        <tr>
          <td align="center" style="border-radius: 6px; background-color: ${buttonColor.bg};">
            <a href="${buttonUrl}" target="_blank" style="display: inline-block; padding: ${padding}; font-size: ${fontSize}; font-weight: 600; color: ${buttonColor.text}; text-decoration: none; border-radius: 6px; background-color: ${buttonColor.bg};">
              ${buttonText}
            </a>
          </td>
        </tr>
      </table>
    `;
    
    editor.chain().focus().insertContent(buttonHtml).run();
    setButtonText('Click Here');
    setButtonUrl('');
    setButtonOpen(false);
  }, [editor, buttonUrl, buttonText, buttonColor, buttonSize]);

  const insertSpacer = useCallback((height: number) => {
    if (!editor) return;
    editor.chain().focus().insertContent(`<div style="height: ${height}px;"></div>`).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="border-b bg-muted/30 p-2 flex flex-wrap gap-1 items-center">
        {/* Undo/Redo */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-8 w-8 p-0"
          data-testid="button-undo"
        >
          <Undo className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-8 w-8 p-0"
          data-testid="button-redo"
        >
          <Redo className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Headings */}
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 1 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          data-testid="toggle-h1"
        >
          <Heading1 className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 2 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          data-testid="toggle-h2"
        >
          <Heading2 className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 3 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          data-testid="toggle-h3"
        >
          <Heading3 className="w-4 h-4" />
        </Toggle>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Text Formatting */}
        <Toggle
          size="sm"
          pressed={editor.isActive('bold')}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          data-testid="toggle-bold"
        >
          <Bold className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('italic')}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          data-testid="toggle-italic"
        >
          <Italic className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('underline')}
          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          data-testid="toggle-underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('strike')}
          onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          data-testid="toggle-strike"
        >
          <Strikethrough className="w-4 h-4" />
        </Toggle>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Text Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-color">
              <Palette className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-5 gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={cn(
                    "w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform",
                    color === '#FFFFFF' && "border-gray-300"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  data-testid={`color-${color}`}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Alignment */}
        <Toggle
          size="sm"
          pressed={editor.isActive({ textAlign: 'left' })}
          onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}
          data-testid="toggle-align-left"
        >
          <AlignLeft className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive({ textAlign: 'center' })}
          onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}
          data-testid="toggle-align-center"
        >
          <AlignCenter className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive({ textAlign: 'right' })}
          onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}
          data-testid="toggle-align-right"
        >
          <AlignRight className="w-4 h-4" />
        </Toggle>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Lists */}
        <Toggle
          size="sm"
          pressed={editor.isActive('bulletList')}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          data-testid="toggle-bullet-list"
        >
          <List className="w-4 h-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('orderedList')}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          data-testid="toggle-ordered-list"
        >
          <ListOrdered className="w-4 h-4" />
        </Toggle>

        <Toggle
          size="sm"
          pressed={editor.isActive('blockquote')}
          onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
          data-testid="toggle-blockquote"
        >
          <Quote className="w-4 h-4" />
        </Toggle>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="h-8 w-8 p-0"
          data-testid="button-hr"
          title="Divider"
        >
          <Minus className="w-4 h-4" />
        </Button>

        {/* Spacer */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-spacer" title="Add Spacer">
              <Space className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => insertSpacer(10)}>Small</Button>
              <Button size="sm" variant="outline" onClick={() => insertSpacer(20)}>Medium</Button>
              <Button size="sm" variant="outline" onClick={() => insertSpacer(40)}>Large</Button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Link */}
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('link')}
              data-testid="toggle-link"
            >
              <LinkIcon className="w-4 h-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link-url">URL</Label>
                <Input
                  id="link-url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  data-testid="input-link-url"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={setLink} data-testid="button-set-link">
                  Set Link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setLinkOpen(false);
                  }}
                  data-testid="button-remove-link"
                >
                  Remove
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Image */}
        <Popover open={imageOpen} onOpenChange={setImageOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-image">
              <ImageIcon className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-url">Image URL</Label>
                <Input
                  id="image-url"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  data-testid="input-image-url"
                />
              </div>
              <Button size="sm" onClick={addImage} data-testid="button-add-image">
                Add Image
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Button */}
        <Popover open={buttonOpen} onOpenChange={setButtonOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" data-testid="button-insert-button" title="Insert Button">
              <MousePointerClick className="w-4 h-4" />
              <span className="text-xs">Button</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="button-text">Button Text</Label>
                <Input
                  id="button-text"
                  placeholder="Click Here"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  data-testid="input-button-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="button-url">Button URL</Label>
                <Input
                  id="button-url"
                  placeholder="https://example.com"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  data-testid="input-button-url"
                />
              </div>
              <div className="space-y-2">
                <Label>Button Color</Label>
                <div className="grid grid-cols-5 gap-2">
                  {BUTTON_COLORS.map((color) => (
                    <button
                      key={color.name}
                      className={cn(
                        "h-8 rounded text-xs font-medium transition-all",
                        buttonColor.name === color.name && "ring-2 ring-offset-2 ring-primary"
                      )}
                      style={{ backgroundColor: color.bg, color: color.text }}
                      onClick={() => setButtonColor(color)}
                      title={color.name}
                    >
                      Aa
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Size</Label>
                <Select value={buttonSize} onValueChange={(v: 'small' | 'medium' | 'large') => setButtonSize(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-2">
                <div 
                  className="p-4 bg-gray-50 rounded flex justify-center"
                  style={{ backgroundColor: '#f9fafb' }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      padding: buttonSize === 'small' ? '8px 16px' : buttonSize === 'large' ? '16px 32px' : '12px 24px',
                      fontSize: buttonSize === 'small' ? '14px' : buttonSize === 'large' ? '18px' : '16px',
                      fontWeight: 600,
                      color: buttonColor.text,
                      backgroundColor: buttonColor.bg,
                      borderRadius: '6px',
                      textDecoration: 'none',
                    }}
                  >
                    {buttonText || 'Button Preview'}
                  </span>
                </div>
              </div>
              <Button size="sm" onClick={insertButton} disabled={!buttonUrl || !buttonText} className="w-full" data-testid="button-insert">
                Insert Button
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} className="min-h-[300px]" data-testid="editor-content" />

      {/* Editor Styles */}
      <style>{`
        .ProseMirror {
          min-height: 300px;
          padding: 1rem;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #adb5bd;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror h1 {
          font-size: 2em;
          font-weight: bold;
          margin-top: 0.67em;
          margin-bottom: 0.67em;
        }
        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin-top: 0.83em;
          margin-bottom: 0.83em;
        }
        .ProseMirror h3 {
          font-size: 1.17em;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 1em;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5em;
          margin: 1em 0;
        }
        .ProseMirror li {
          margin: 0.25em 0;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1em;
          margin: 1em 0;
          color: #6b7280;
        }
        .ProseMirror hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 2em 0;
        }
        .ProseMirror a {
          color: #4f46e5;
          text-decoration: underline;
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
        }
        .ProseMirror table {
          margin: 1em 0;
        }
        .ProseMirror table td {
          padding: 0;
        }
        .ProseMirror table a {
          text-decoration: none !important;
        }
      `}</style>
    </div>
  );
}
