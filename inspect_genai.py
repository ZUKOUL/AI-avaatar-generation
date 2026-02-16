from google import genai
from google.genai import types
import inspect

print("--- Video Type ---")
try:
    print(inspect.signature(types.Video))
    # print(types.Video.__doc__)
    print(dir(types.Video))
except Exception as e:
    print(e)
