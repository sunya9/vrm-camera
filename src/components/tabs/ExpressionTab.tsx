import { Button } from "@/components/ui/button";

const EXPRESSIONS = [
  { name: "happy", emoji: "😊", label: "嬉しい" },
  { name: "angry", emoji: "😠", label: "怒り" },
  { name: "sad", emoji: "😢", label: "悲しい" },
  { name: "relaxed", emoji: "😌", label: "リラックス" },
  { name: "surprised", emoji: "😲", label: "驚き" },
  { name: "aa", emoji: "👄", label: "あ" },
  { name: "ih", emoji: "😬", label: "い" },
  { name: "ou", emoji: "😮", label: "う" },
  { name: "ee", emoji: "😁", label: "え" },
  { name: "oh", emoji: "⭕", label: "お" },
  { name: "blink", emoji: "😉", label: "ウインク" },
];

interface ExpressionTabProps {
  activeExpression: string | null;
  onTriggerExpression: (name: string) => void;
}

export function ExpressionTab({ activeExpression, onTriggerExpression }: ExpressionTabProps) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {EXPRESSIONS.map((expr) => (
          <Button
            key={expr.name}
            size="sm"
            variant={activeExpression === expr.name ? "default" : "secondary"}
            onClick={() => onTriggerExpression(expr.name)}
            className="text-xs"
          >
            <span className="mr-0.5 text-base">{expr.emoji}</span> {expr.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        クリックで2秒間表情を表示（トラッキング中も有効）
      </p>
    </div>
  );
}
