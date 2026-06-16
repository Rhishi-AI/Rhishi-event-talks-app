import os
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, send_from_directory

app = Flask(__name__, static_folder='static', template_folder='templates')

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def fetch_and_parse_feed():
    req = urllib.request.Request(
        FEED_URL,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
    except Exception as e:
        print(f"Error fetching feed: {e}")
        raise e

    root = ET.fromstring(xml_data)
    
    # Atom namespace maps
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = []
    for entry in root.findall('atom:entry', ns):
        title_el = entry.find('atom:title', ns)
        title_text = title_el.text if title_el is not None else "Unknown Date"
        
        updated_el = entry.find('atom:updated', ns)
        updated_text = updated_el.text if updated_el is not None else ""
        
        link_el = entry.find('atom:link', ns)
        link_href = link_el.attrib.get('href', '') if link_el is not None else ""
        
        content_el = entry.find('atom:content', ns)
        content_text = content_el.text if content_el is not None else ""
        
        entries.append({
            'title': title_text,
            'updated': updated_text,
            'link': link_href,
            'content': content_text
        })
        
    return entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    try:
        notes = fetch_and_parse_feed()
        return jsonify({
            'status': 'success',
            'data': notes
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# Route to serve standard static assets
@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    # Running on port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
