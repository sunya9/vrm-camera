![VRM Camera](public/og.png)

# VRM Camera

VRMモデルをWebカメラでリアルタイムに動かすバーチャルカメラアプリです。MediaPipe による顔・体・手のトラッキングに対応しています。

## インストール

### Web版

https://sunya9.github.io/vrm-camera/ にアクセスしてください。

### デスクトップ版 (macOS)

[Releases](https://github.com/sunya9/vrm-camera/releases) から `.dmg` をダウンロードしてください。

アプリはコード署名されていないため、初回起動時に「壊れている」と表示される場合があります。以下のコマンドで解除してください：

```bash
xattr -cr /Applications/VRM\ Camera.app
```

## License

MIT
