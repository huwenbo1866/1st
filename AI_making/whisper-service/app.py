from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import os
import tempfile
from werkzeug.utils import secure_filename
from zhconv import convert

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 加载 Whisper 模型（可选：tiny, base, small, medium, large）
# tiny 最快但准确度较低，base 是平衡选择
print("🔄 正在加载 Whisper 模型...")
model = whisper.load_model("base")
print("✅ Whisper 模型加载完成")

ALLOWED_EXTENSIONS = {'mp3', 'wav', 'mp4', 'm4a', 'ogg', 'webm'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """音频转文字接口"""
    try:
        # 检查是否有文件上传
        if 'audio' not in request.files:
            return jsonify({'error': '没有上传音频文件'}), 400
        
        file = request.files['audio']
        
        if file.filename == '':
            return jsonify({'error': '文件名为空'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': f'不支持的文件格式，支持: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        # 获取可选参数
        language = request.form.get('language', 'zh')  # 默认中文
        
        # 保存临时文件
        filename = secure_filename(file.filename)
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
        
        print(f"📝 正在转录音频: {filename}")
        
        # 使用 Whisper 转录
        result = model.transcribe(
            temp_path,
            language=language if language != 'auto' else None,
            fp16=False  # CPU 模式
        )
        
        # 删除临时文件
        os.unlink(temp_path)
        
        # 转换繁体为简体
        text_simplified = convert(result['text'], 'zh-cn')
        segments_simplified = [
            {
                'start': seg['start'],
                'end': seg['end'],
                'text': convert(seg['text'], 'zh-cn')
            }
            for seg in result['segments']
        ]
        
        print(f"✅ 转录完成")
        
        return jsonify({
            'success': True,
            'text': text_simplified,
            'language': result['language'],
            'segments': segments_simplified
        })
    
    except Exception as e:
        print(f"❌ 转录错误: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'service': 'whisper-transcription',
        'model': 'base'
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Whisper 服务运行在 http://localhost:{port}")
    print(f"📡 可用端点:")
    print(f"   - 健康检查: GET http://localhost:{port}/api/health")
    print(f"   - 音频转文字: POST http://localhost:{port}/api/transcribe")
    app.run(host='0.0.0.0', port=port, debug=True)
