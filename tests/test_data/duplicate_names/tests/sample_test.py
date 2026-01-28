from tests.utils import test_helper, common_function

def test_something():
    """Test function that uses tests utils"""
    result = test_helper()
    common = common_function()
    return result + common
